import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGeolocation } from '../../hooks/useGeolocation';
import { fetchNearbyHospitals } from '../../api/medicalApi';
import type { MedicalFacility } from '../../types/medical';
import DecryptedText from '../../components/DecryptedText/DecryptedText';
import ExpandableSearch from '../../components/ExpandableSearch/ExpandableSearch';
import './index.css';

function formatDistance(meters?: number | null) {
  if (meters == null || Number.isNaN(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function mapsUrl(facility: MedicalFacility) {
  const query = encodeURIComponent(facility.address || facility.name);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

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
    <div className="nearbyPage">
      <header className="nearbyHero">
        <p className="nearbyEyebrow">{t('nearby.eyebrow')}</p>
        <h1>
          <DecryptedText
            text={t('nearby.title')}
            speed={36}
            sequential
            revealDirection="center"
            useOriginalCharsOnly
            animateOn="view"
          />
        </h1>
        <p className="nearbyDesc">{t('nearby.desc')}</p>
        <ExpandableSearch
          className="nearbySearch"
          placeholder={busy ? t('nearby.searching') : t('nearby.searchButton')}
          ariaLabel={t('nearby.searchButton')}
          onSubmitSearch={() => {
            void handleSearch();
          }}
          disabled={busy}
        />
        <p className="nearbyNote">{t('nearby.privacyNote')}</p>
      </header>

      {(errorMessage || permissionHint) && (
        <div className="nearbyAlert" role="alert">
          {errorMessage && <p>{errorMessage}</p>}
          {permissionHint && <p className="nearbyHint">{permissionHint}</p>}
        </div>
      )}

      {position && (
        <section className="nearbyCoords" aria-live="polite">
          <h2>{t('nearby.currentLocation')}</h2>
          <p>
            {t('nearby.coords', {
              lat: position.latitude.toFixed(5),
              lng: position.longitude.toFixed(5),
              accuracy: Math.round(position.accuracy),
            })}
          </p>
        </section>
      )}

      {searchError && (
        <div className="nearbyAlert" role="alert">
          <p>{searchError}</p>
        </div>
      )}

      {hasSearched && !searching && !searchError && facilities.length === 0 && (
        <div className="nearbyEmpty">
          <h2>{t('nearby.emptyTitle')}</h2>
          <p>{t('nearby.emptyDesc')}</p>
        </div>
      )}

      {facilities.length > 0 && (
        <section className="nearbyList" aria-label={t('nearby.listTitle')}>
          <h2>{t('nearby.listTitle')}</h2>
          <ul>
            {facilities.map((facility) => {
              const distance = formatDistance(facility.distance_meters);
              return (
                <li key={facility.id ?? `${facility.name}-${facility.latitude}`}>
                  <article className="nearbyCard">
                    <div className="nearbyCardHead">
                      <h3>{facility.name}</h3>
                      {distance && <span className="nearbyDistance">{distance}</span>}
                    </div>
                    <p className="nearbyType">{facility.type}</p>
                    <p className="nearbyAddress">{facility.address}</p>
                    {facility.phone && (
                      <a className="nearbyPhone" href={`tel:${facility.phone}`}>
                        {facility.phone}
                      </a>
                    )}
                    <a
                      className="nearbyMapLink"
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
