import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGeolocation } from '../../hooks/useGeolocation';
import { fetchNearbyHospitals } from '../../api/medicalApi';
import type { MedicalFacility } from '../../types/medical';
import DecryptedText from '../../components/DecryptedText/DecryptedText';
import ExpandableSearch from '../../components/ExpandableSearch/ExpandableSearch';

function formatDistance(meters?: number | null) {
  if (meters == null || Number.isNaN(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function mapsUrl(facility: MedicalFacility) {
  const query = encodeURIComponent(facility.address || facility.name);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/* ────────── 樣式（原 index.css 遷移） ────────── */
// 定位失敗／搜尋失敗共用的警示框：danger 以 color-mix 淡出當底與框線
const ALERT_CLASS =
  'rounded-[14px] border border-[color-mix(in_srgb,var(--danger,#c44)_28%,transparent)] bg-[color-mix(in_srgb,var(--danger,#c44)_12%,transparent)] px-4 py-3';
// 座標／清單／空狀態共用的白卡
const PANEL_CLASS = 'rounded-lg border border-hair bg-surface p-4';
const PANEL_H2 = 'm-0 mb-2 text-base';

const NearbyHospitalsPage = () => {
  const { t } = useTranslation();
  const { position, loading: locating, errorCode, errorMessage, requestPosition } =
    useGeolocation();
  const [facilities, setFacilities] = useState<MedicalFacility[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const busy = locating || searching;

  const handleSearch = async () => {
    setSearchError(null);
    const geo = await requestPosition();
    if (!geo) return;

    setSearching(true);
    setHasSearched(true);
    try {
      const result = await fetchNearbyHospitals(geo.latitude, geo.longitude);
      setFacilities(result.facilities);
    } catch (err) {
      setFacilities([]);
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

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4 p-4">
      <header className="overflow-hidden rounded-xl bg-[linear-gradient(135deg,var(--primary-strong),var(--primary))] px-6 py-8 text-white">
        <p className="m-0 mb-2 text-[0.8rem] tracking-[0.06em] uppercase opacity-85">{t('nearby.eyebrow')}</p>
        {/* 標題沿用全域 h1 墨色（原設計即如此），不套 text-white */}
        <h1 className="m-0 mb-2 text-[clamp(1.4rem,4vw,1.85rem)] font-bold">
          <DecryptedText
            text={t('nearby.title')}
            speed={36}
            sequential
            revealDirection="center"
            useOriginalCharsOnly
            animateOn="view"
          />
        </h1>
        <p className="m-0 mb-4 leading-normal opacity-92">{t('nearby.desc')}</p>
        <ExpandableSearch
          placeholder={busy ? t('nearby.searching') : t('nearby.searchButton')}
          ariaLabel={t('nearby.searchButton')}
          onSubmitSearch={() => {
            void handleSearch();
          }}
          disabled={busy}
        />
        <p className="mt-3 mb-0 text-[0.82rem] leading-[1.45] opacity-82">{t('nearby.privacyNote')}</p>
      </header>

      {(errorMessage || permissionHint) && (
        <div className={ALERT_CLASS} role="alert">
          {errorMessage && <p className="m-0 leading-normal">{errorMessage}</p>}
          {permissionHint && <p className="mt-[0.4rem] mb-0 text-[0.9rem] leading-normal opacity-90">{permissionHint}</p>}
        </div>
      )}

      {position && (
        <section className={PANEL_CLASS} aria-live="polite">
          <h2 className={PANEL_H2}>{t('nearby.currentLocation')}</h2>
          <p className="m-0 leading-normal text-muted-foreground">
            {t('nearby.coords', {
              lat: position.latitude.toFixed(5),
              lng: position.longitude.toFixed(5),
              accuracy: Math.round(position.accuracy),
            })}
          </p>
        </section>
      )}

      {searchError && (
        <div className={ALERT_CLASS} role="alert">
          <p className="m-0 leading-normal">{searchError}</p>
        </div>
      )}

      {hasSearched && !searching && !searchError && facilities.length === 0 && (
        <div className={PANEL_CLASS}>
          <h2 className={PANEL_H2}>{t('nearby.emptyTitle')}</h2>
          <p className="m-0 leading-normal text-muted-foreground">{t('nearby.emptyDesc')}</p>
        </div>
      )}

      {facilities.length > 0 && (
        <section className={PANEL_CLASS} aria-label={t('nearby.listTitle')}>
          <h2 className={PANEL_H2}>{t('nearby.listTitle')}</h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {facilities.map((facility) => {
              const distance = formatDistance(facility.distance_meters);
              return (
                <li key={facility.id ?? `${facility.name}-${facility.latitude}`}>
                  <article className="flex flex-col gap-[0.35rem] rounded-md bg-surface-2 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="m-0 text-[1.05rem]">{facility.name}</h3>
                      {distance && <span className="shrink-0 text-[0.85rem] font-[650] text-primary">{distance}</span>}
                    </div>
                    <p className="m-0 text-[0.82rem] text-muted-foreground">{facility.type}</p>
                    <p className="m-0 leading-[1.45]">{facility.address}</p>
                    {facility.phone && (
                      <a className="text-[0.92rem] text-primary no-underline" href={`tel:${facility.phone}`}>
                        {facility.phone}
                      </a>
                    )}
                    <a
                      className="mt-[0.2rem] text-[0.92rem] font-semibold text-primary no-underline"
                      href={mapsUrl(facility)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('nearby.openMap')}
                    </a>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
};

export default NearbyHospitalsPage;
