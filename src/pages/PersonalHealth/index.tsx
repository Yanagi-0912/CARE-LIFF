import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon, ChevronRightIcon, FileTextIcon, RotateCwIcon, TriangleAlertIcon } from 'lucide-react';
import liff from '@line/liff';
import { toast } from 'sonner';
import { getPersonalHealthProfile, upsertPersonalHealthProfile, type HealthProfile, type UpsertPersonalHealthPayload } from '@/api/profileApi';
import { useLiff } from '@/hooks/useLiff';
import { queryKeys } from '@/lib/queryClient';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { CHRONIC_OPTIONS, GENDER_OPTIONS, profileToFormValues, type HealthData } from './healthForm';
import ProfileEditor from './ProfileEditor';

type View = 'summary' | 'details' | 'edit';

export default function PersonalHealthPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { liffReady } = useLiff();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedView = searchParams.get('view');
    const view: View = requestedView === 'details' || requestedView === 'edit' ? requestedView : 'summary';
    const [editorSession, setEditorSession] = useState({ active: view === 'edit', id: 0 });
    const queryClient = useQueryClient();
    // Mutation 留在 QueryClient，離開再進入頁面也不能送出第二份整份覆寫。
    const isSaving = useIsMutating({ mutationKey: queryKeys.myProfile }) > 0;
    const navigationEpoch = useRef(0);
    const mounted = useRef(false);
    useLayoutEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    useLayoutEffect(() => {
        navigationEpoch.current += 1;
        return () => { navigationEpoch.current += 1; };
    }, [location.key]);
    const saveMutation = useMutation({
        mutationKey: queryKeys.myProfile,
        mutationFn: (payload: UpsertPersonalHealthPayload) => upsertPersonalHealthProfile(payload),
        onSuccess: async (_result, payload) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.myProfile });
            queryClient.setQueryData<HealthProfile | null>(queryKeys.myProfile, current => ({ ...current, ...payload }));
            void queryClient.invalidateQueries({ queryKey: queryKeys.myProfile, refetchType: 'none' });
        },
    });
    const setView = (next: View, replace = false) => {
        if (next === 'edit') setEditorSession(current => ({ ...current, active: true }));
        const params = new URLSearchParams(searchParams);
        if (next === 'summary') params.delete('view');
        else params.set('view', next);
        setSearchParams(params, { replace, state: { personalHealthFrom: view } });
    };
    const returnToView = (next: View) => {
        if (location.state?.personalHealthFrom === next) navigate(-1);
        else setView(next, true);
    };
    const discardEditor = () => {
        setEditorSession(current => ({ ...current, id: current.id + 1 }));
        returnToView('details');
    };
    const saveProfile = async (form: HealthData) => {
        // isMutating 立即讀取快取狀態，避免 React 尚未重繪時的連續送出。
        if (!mounted.current || queryClient.isMutating({ mutationKey: queryKeys.myProfile })) return;
        const startedAt = navigationEpoch.current;
        const currentProfile = queryClient.getQueryData<HealthProfile | null>(queryKeys.myProfile);
        const payload: UpsertPersonalHealthPayload = {
            name: form.name,
            gender: form.gender,
            height: Number(form.height),
            weight: Number(form.weight),
            age: Number(form.age),
            chronic_diseases: form.chronicDisease,
            chronic_custom: form.customChronic,
            major_illness_history: form.majorIllness.trim(),
            surgery_history: form.surgeryHistory.trim(),
            health_consultations: currentProfile?.health_consultations ?? {},
        };
        try {
            await saveMutation.mutateAsync(payload);
            // 瀏覽器返回、離頁或重新進入後，舊請求只能更新快取，不能導走新畫面。
            if (navigationEpoch.current !== startedAt) return;
            toast.success(t('personalHealth.saveSuccess'));
            discardEditor();
        } catch (error) {
            if (navigationEpoch.current !== startedAt) return;
            console.error('儲存失敗（網路或請求中斷）:', error);
            toast.error(error instanceof Error ? error.message : t('personalHealth.networkError'));
        }
    };
    const heading = useRef<HTMLHeadingElement>(null);
    const { data: profile, isError, isFetching, refetch } = useQuery({
        queryKey: queryKeys.myProfile,
        queryFn: () => getPersonalHealthProfile(),
    });
    const { data: liffProfile } = useQuery({
        queryKey: queryKeys.liffProfile,
        queryFn: () => liff.getProfile(),
        enabled: liffReady,
        retry: false,
        staleTime: Infinity,
    });
    const liffName = liffProfile?.displayName?.trim() ?? '';
    const data = profileToFormValues(profile);
    const name = data.name || liffName;
    const empty = t('personalHealth.notProvided');
    const chronic = [
        ...data.chronicDisease.map(code => {
            const option = CHRONIC_OPTIONS.find(option => option.value === code);
            return option ? t(option.labelKey) : code;
        }),
        ...data.customChronic,
    ].join(t('personalHealth.listSeparator'));
    const gender = GENDER_OPTIONS.find(option => option.value === data.gender);
    const sections = [
        { title: 'personalHealth.step1.title', rows: [
            ['personalHealth.name', name],
            ['personalHealth.gender', gender ? t(gender.labelKey) : ''],
            ['personalHealth.age', data.age && `${data.age} ${t('personalHealth.unit.age')}`],
        ] },
        { title: 'personalHealth.step2.title', rows: [
            ['personalHealth.height', data.height], ['personalHealth.weight', data.weight],
        ] },
        { title: 'personalHealth.step3.title', rows: [
            ['personalHealth.chronic', chronic],
            ['personalHealth.majorIllness', data.majorIllness],
            ['personalHealth.surgeryHistory', data.surgeryHistory],
        ] },
    ];

    useEffect(() => {
        heading.current?.focus({ preventScroll: true });
        window.scrollTo({ top: 0 });
    }, [view]);

    // PUT 會覆寫整份檔案。只有讀到資料（含 404）才允許進入編輯，
    // 背景重抓失敗但仍有快取時則保留現有資料。
    return (
        <div className="mx-auto w-full max-w-[42rem]">
            <div className="mb-6 flex items-center gap-3">
                {view !== 'summary' && (
                    <Button variant="outline" size="icon" className="shrink-0 rounded-full"
                        aria-label={t('personalHealth.return')}
                        disabled={isSaving}
                        onClick={() => view === 'edit' ? discardEditor() : returnToView('summary')}>
                        <ArrowLeftIcon aria-hidden="true" />
                    </Button>
                )}
                <div>
                    <h1 ref={heading} tabIndex={-1} className="text-2xl font-extrabold leading-relaxed outline-none">
                        {t(view === 'summary' ? 'personalHealth.overviewTitle' : view === 'details' ? 'personalHealth.details' : 'personalHealth.edit')}
                    </h1>
                    {view === 'summary' && <p className="mt-1 text-base text-muted-foreground">{t('personalHealth.overviewDesc')}</p>}
                </div>
            </div>
            {profile === undefined ? (isError ? (
                <div className="flex flex-col gap-3">
                    <Alert variant="destructive">
                        <TriangleAlertIcon />
                        <AlertTitle>{t('personalHealth.loadError')}</AlertTitle>
                        <AlertDescription>{t('personalHealth.loadErrorGuard')}</AlertDescription>
                    </Alert>
                    <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
                        {isFetching ? <Spinner /> : <RotateCwIcon />}{t('personalHealth.retry')}
                    </Button>
                </div>
            ) : (
                <p role="status" className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                    <Spinner aria-hidden="true" />{t('personalHealth.loading')}
                </p>
            )) : view === 'summary' ? (
                <>
                    <section className="mb-6 flex items-center gap-4 py-2" aria-label={t('personalHealth.step1.title')}>
                        <Avatar className="size-20 shrink-0 rounded-2xl after:rounded-2xl">
                            <AvatarImage className="rounded-2xl" src={liffProfile?.pictureUrl} alt={t('personalHealth.avatarAlt', { name })} />
                            <AvatarFallback className="rounded-2xl bg-primary/10 text-3xl font-bold text-primary">
                                {name.charAt(0) || t('personalHealth.avatarFallback')}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <p className="text-2xl font-bold break-words text-ink">{name || empty}</p>
                            <p className="text-base text-muted-foreground">{data.age ? `${data.age} ${t('personalHealth.unit.age')}` : t('personalHealth.ageNotSet')}</p>
                            <Button variant="link" className="h-auto min-h-11 px-0 text-base underline underline-offset-4"
                                onClick={() => setView('details')}>{t('personalHealth.details')}</Button>
                        </div>
                    </section>

                </>
            ) : view === 'details' ? (
                <div className="profile-details">
                    {sections.map(section => (
                        <section key={section.title} className="profile-read-section" aria-label={t(section.title)}>
                            <h2 className="mb-2 text-lg font-bold">{t(section.title)}</h2>
                            <dl>{section.rows.map(([label, value]) => (
                                <div key={label} className="profile-read-row">
                                    <dt className="text-muted-foreground">{t(label)}</dt>
                                    <dd className="font-semibold whitespace-pre-wrap text-ink">{value.trim() || empty}</dd>
                                </div>
                            ))}</dl>
                        </section>
                    ))}
                    <div className="flex justify-center border-t pt-2">
                        <Button variant="link" className="text-base underline underline-offset-4" onClick={() => setView('edit')}>{t('personalHealth.edit')}</Button>
                    </div>
                </div>
            ) : null}
            {profile !== undefined && (view === 'edit' || editorSession.active) && (
                <div hidden={view !== 'edit'}>
                    <ProfileEditor key={editorSession.id} profile={profile} liffName={liffName}
                        isSaving={isSaving} onSave={saveProfile} onCancel={discardEditor} />
                </div>
            )}
            {view === 'summary' && (
                    <button type="button" className="care-entry-row" onClick={() => navigate('/personalhealth/consult')}>
                        <span className="care-entry-icon"><FileTextIcon aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1"><strong className="block text-lg">{t('personalHealth.viewConsult')}</strong><span className="text-sm text-muted-foreground">{t('personalHealth.consultDesc')}</span></span>
                        <ChevronRightIcon className="size-5 shrink-0 text-faint" aria-hidden="true" />
                    </button>
            )}
        </div>
    );
}
