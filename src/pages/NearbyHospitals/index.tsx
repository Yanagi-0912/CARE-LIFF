import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGeolocation } from '../../hooks/useGeolocation';
import { fetchNearbyHospitals } from '../../api/medicalApi';
import type { MedicalFacility } from '../../types/medical';
import DecryptedText from '../../components/DecryptedText/DecryptedText';
import ExpandableSearch from '../../components/ExpandableSearch/ExpandableSearch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from '@/components/ui/item';
import { ItemGroup } from '@/components/ui/item';

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
          <p className="mt-2 mb-4 opacity-90">{t('nearby.desc')}</p>
          <ExpandableSearch
            placeholder={busy ? t('nearby.searching') : t('nearby.searchButton')}
            ariaLabel={t('nearby.searchButton')}
            onSubmitSearch={() => {
              void handleSearch();
            }}
            disabled={busy}
          />
          <p className="mt-3 text-xs leading-relaxed opacity-80">{t('nearby.privacyNote')}</p>
        </CardContent>
      </Card>

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

      {hasSearched && !searching && !searchError && facilities.length === 0 && (
        <Card size="sm">
          <CardContent>
            <h2 className="mb-1 text-base font-bold">{t('nearby.emptyTitle')}</h2>
            <p className="text-muted-foreground">{t('nearby.emptyDesc')}</p>
          </CardContent>
        </Card>
      )}

      {facilities.length > 0 && (
        <section aria-label={t('nearby.listTitle')}>
          <h2 className="mb-2 text-base font-bold">{t('nearby.listTitle')}</h2>
          <ItemGroup className="gap-3">
            {facilities.map((facility) => {
              const distance = formatDistance(facility.distance_meters);
              return (
                <Item
                  key={facility.id ?? `${facility.name}-${facility.latitude}`}
                  variant="outline"
                  className="flex-wrap items-start"
                >
                  <ItemContent>
                    <ItemTitle className="text-base">{facility.name}</ItemTitle>
                    <ItemDescription>{facility.type}</ItemDescription>
                    <ItemDescription className="text-foreground">
                      {facility.address}
                    </ItemDescription>
                  </ItemContent>

                  {distance && (
                    <ItemActions>
                      <Badge variant="secondary">{distance}</Badge>
                    </ItemActions>
                  )}

                  <ItemFooter className="justify-start gap-4">
                    {facility.phone && (
                      <a className="font-semibold text-primary" href={`tel:${facility.phone}`}>
                        {facility.phone}
                      </a>
                    )}
                    <a
                      className="font-semibold text-primary"
                      href={mapsUrl(facility)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('nearby.openMap')}
                    </a>
                  </ItemFooter>
                </Item>
              );
            })}
          </ItemGroup>
        </section>
      )}
    </div>
  );
};

export default NearbyHospitalsPage;
