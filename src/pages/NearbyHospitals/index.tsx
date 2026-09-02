import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useGeolocation } from '../../hooks/useGeolocation';
import { fetchNearbyHospitals, searchFacilitiesByName } from '../../api/medicalApi';
import type {
  FacilitySearchResponse,
  NearbyHospitalsResponse,
} from '../../types/medical';
import DecryptedText from '../../components/DecryptedText/DecryptedText';
import FacilityCard from './FacilityCard';
import { DEPARTMENT_OPTIONS, FACILITY_TYPE_OPTIONS } from './filters';
import { buildEmptyStateMessage, buildResultSummary } from './searchSummary';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type SearchMode = 'nearby' | 'name';

/** 篩選用的膠囊按鈕。用 aria-pressed 而非 checkbox：它是「套用一個條件」而非表單欄位。 */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

const NearbyHospitalsPage = () => {
  const { t } = useTranslation();
  const { position, loading: locating, errorCode, errorMessage, requestPosition } =
    useGeolocation();

  const [mode, setMode] = useState<SearchMode>('nearby');
  const [facilityType, setFacilityType] = useState('');
  const [department, setDepartment] = useState('');
  const [openNow, setOpenNow] = useState(false);
  const [keyword, setKeyword] = useState('');

  const [nearbyResult, setNearbyResult] = useState<NearbyHospitalsResponse | null>(null);
  const [nameResult, setNameResult] = useState<FacilitySearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const busy = locating || searching;

  const handleNearbySearch = async () => {
    setSearchError(null);
    const geo = await requestPosition();
    if (!geo) return;

    setSearching(true);
    // 換一種搜尋方式時清掉另一種的結果：兩份結果同時掛在畫面上，
    // 使用者無從分辨哪一份對應他剛剛按的按鈕。
    setNameResult(null);
    try {
      const result = await fetchNearbyHospitals(geo.latitude, geo.longitude, {
        openNow,
        department,
        facilityType,
      });
      setNearbyResult(result);
    } catch (err) {
      setNearbyResult(null);
      setSearchError(err instanceof Error ? err.message : t('nearby.searchError'));
    } finally {
      setSearching(false);
    }
  };

  const handleNameSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = keyword.trim();
    if (!trimmed) {
      setSearchError(t('nearby.keywordRequired'));
      return;
    }

    setSearchError(null);
    setSearching(true);
    setNearbyResult(null);
    try {
      // 座標是選填的：有的話後端會先在生活圈內比對（同名院所全台有數十家），
      // 沒有也照樣查得到，因此不為了名稱查詢去要一次定位權限。
      const result = await searchFacilitiesByName(trimmed, {
        lat: position?.latitude,
        lng: position?.longitude,
      });
      setNameResult(result);
    } catch (err) {
      setNameResult(null);
      setSearchError(err instanceof Error ? err.message : t('nearby.searchError'));
    } finally {
      setSearching(false);
    }
  };

  const permissionHint =
    errorCode === 'permission_denied'
      ? t('nearby.hintPermission')
      : errorCode === 'insecure'
        ? t('nearby.hintHttps')
        : errorCode === 'unsupported'
          ? t('nearby.hintUnsupported')
          : errorCode === 'timeout' || errorCode === 'unavailable'
            ? t('nearby.hintTimeout')
            : null;

  const summaryLines = nearbyResult && nearbyResult.count > 0
    ? buildResultSummary(nearbyResult)
    : [];
  const emptyLine =
    nearbyResult && nearbyResult.count === 0 ? buildEmptyStateMessage(nearbyResult) : null;
  const facilities = nearbyResult?.facilities ?? nameResult?.facilities ?? [];

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4 p-4">
      <Card className="bg-primary text-primary-foreground">
        <CardContent>
          <p className="text-xs tracking-wide uppercase opacity-85">{t('nearby.eyebrow')}</p>
          {/* text-inherit 的理由同首頁 hero：base 層的 h1 墨色會蓋掉繼承色 */}
          <h1 className="mt-2 text-[clamp(1.4rem,4vw,1.85rem)] font-bold text-inherit">
            <DecryptedText
              text={t('nearby.title')}
              speed={36}
              sequential
              revealDirection="center"
              useOriginalCharsOnly
              animateOn="view"
            />
          </h1>
          <p className="mt-2 opacity-90">{t('nearby.desc')}</p>
          <p className="mt-3 text-xs leading-relaxed opacity-80">{t('nearby.privacyNote')}</p>
        </CardContent>
      </Card>

      <Tabs value={mode} onValueChange={(value) => setMode(value as SearchMode)}>
        <TabsList>
          <TabsTrigger value="nearby">{t('nearby.tabNearby')}</TabsTrigger>
          <TabsTrigger value="name">{t('nearby.tabByName')}</TabsTrigger>
        </TabsList>

        <TabsContent value="nearby">
          <Card size="sm">
            <CardContent className="flex flex-col gap-4">
              <div>
                <p className="mb-2 font-semibold">{t('nearby.filterType')}</p>
                <div className="flex flex-wrap gap-2">
                  {FACILITY_TYPE_OPTIONS.map((option) => (
                    <FilterChip
                      key={option.labelKey}
                      active={facilityType === option.value}
                      onClick={() => setFacilityType(option.value)}
                    >
                      {t(option.labelKey)}
                    </FilterChip>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="department-input" className="mb-2 font-semibold">
                  {t('nearby.filterDepartment')}
                </Label>
                <div className="mb-2 flex flex-wrap gap-2">
                  <FilterChip active={department === ''} onClick={() => setDepartment('')}>
                    {t('nearby.departmentAny')}
                  </FilterChip>
                  {DEPARTMENT_OPTIONS.map((option) => (
                    <FilterChip
                      key={option.value}
                      active={department === option.value}
                      onClick={() => setDepartment(option.value)}
                    >
                      {t(option.labelKey)}
                    </FilterChip>
                  ))}
                </div>
                {/* 快捷鍵只是常見科別，仍保留自由輸入：後端有俗稱別名表與 LLM 兜底，
                    使用者講「腸胃科」「心臟科」這類次專科同樣查得到。 */}
                <Input
                  id="department-input"
                  value={department}
                  placeholder={t('nearby.departmentPlaceholder')}
                  onChange={(event) => setDepartment(event.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="open-now-switch" className="font-semibold">
                  {t('nearby.openNow')}
                </Label>
                <Switch
                  id="open-now-switch"
                  checked={openNow}
                  onCheckedChange={(checked) => setOpenNow(checked)}
                />
              </div>
              <p className="text-muted-foreground -mt-2 text-xs">{t('nearby.openNowHint')}</p>

              <Button
                type="button"
                size="lg"
                disabled={busy}
                onClick={() => {
                  void handleNearbySearch();
                }}
              >
                {busy ? t('nearby.searching') : t('nearby.searchButton')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="name">
          <Card size="sm">
            <CardContent>
              <form className="flex flex-col gap-3" onSubmit={handleNameSearch} role="search">
                <Label htmlFor="keyword-input" className="font-semibold">
                  {t('nearby.keywordLabel')}
                </Label>
                <Input
                  id="keyword-input"
                  value={keyword}
                  placeholder={t('nearby.keywordPlaceholder')}
                  onChange={(event) => setKeyword(event.target.value)}
                />
                <Button type="submit" size="lg" disabled={busy}>
                  {busy ? t('nearby.searching') : t('nearby.keywordButton')}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {(errorMessage || permissionHint) && (
        <Alert variant="destructive">
          <AlertDescription>
            {errorMessage && <p>{errorMessage}</p>}
            {permissionHint && <p className="opacity-90">{permissionHint}</p>}
          </AlertDescription>
        </Alert>
      )}

      {position && (
        <Card size="sm" aria-live="polite">
          <CardContent>
            <h2 className="mb-1 text-base font-bold">{t('nearby.currentLocation')}</h2>
            <p className="text-muted-foreground">
              {t('nearby.coords', {
                lat: position.latitude.toFixed(5),
                lng: position.longitude.toFixed(5),
                accuracy: Math.round(position.accuracy),
              })}
            </p>
          </CardContent>
        </Card>
      )}

      {searchError && (
        <Alert variant="destructive">
          <AlertDescription>{searchError}</AlertDescription>
        </Alert>
      )}

      {/* 查無結果時說明「為什麼沒有」：看不懂科別、藥局收錄有限、還是範圍內真的沒有，
          對使用者是三種完全不同的下一步。 */}
      {emptyLine && (
        <Card size="sm">
          <CardContent>
            <h2 className="mb-1 text-base font-bold">{t('nearby.emptyTitle')}</h2>
            <p className="text-muted-foreground">{t(emptyLine.key, emptyLine.params)}</p>
          </CardContent>
        </Card>
      )}

      {nameResult && nameResult.count === 0 && (
        <Card size="sm">
          <CardContent>
            <h2 className="mb-1 text-base font-bold">{t('nearby.emptyTitle')}</h2>
            <p className="text-muted-foreground">{t('nearby.nameEmpty')}</p>
          </CardContent>
        </Card>
      )}

      {facilities.length > 0 && (
        <section aria-label={t(nearbyResult ? 'nearby.listTitle' : 'nearby.nameResultTitle')}>
          <h2 className="mb-2 text-base font-bold">
            {t(nearbyResult ? 'nearby.listTitle' : 'nearby.nameResultTitle')}
          </h2>

          {summaryLines.length > 0 && (
            <div className="text-muted-foreground mb-3 flex flex-col gap-1" aria-live="polite">
              {summaryLines.map((line) => (
                <p key={line.key}>{t(line.key, line.params)}</p>
              ))}
            </div>
          )}

          {nameResult && nameResult.total_count > nameResult.count && (
            <p className="text-muted-foreground mb-3">
              {t('nearby.nameResultMore', {
                total: nameResult.total_count,
                count: nameResult.count,
              })}
            </p>
          )}

          <div className="flex flex-col gap-3">
            {facilities.map((facility) => (
              <FacilityCard
                key={facility.id ?? `${facility.name}-${facility.latitude}`}
                facility={facility}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default NearbyHospitalsPage;
