import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixedIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface MapPoint {
  latitude: number;
  longitude: number;
}

/** 地圖上的其他人（長輩畫面上正在過來的家人），標記旁邊固定顯示名字 */
export interface MapCompanion extends MapPoint {
  label: string;
}

interface LostMapProps {
  current: (MapPoint & { accuracy: number | null }) | null;
  trail: MapPoint[];
  companions?: MapCompanion[];
  /** 目前位置標記旁的名字；不給就不顯示（家人地圖頁只有一個人，不需要） */
  currentLabel?: string;
  label: string;
  recenterLabel: string;
  /** 圖磚來源標示（依使用者語言），見 TILE_URL 的說明 */
  attribution: string;
}

/**
 * 底圖用內政部國土測繪中心的「臺灣通用電子地圖」（EMAP）WMTS 圖磚：政府開放資料、
 * 免金鑰、地名是中文，長輩與家人對得上路牌。依政府資料開放授權條款須標示來源，
 * 右下角的 attribution 不可拿掉。
 *
 * 試過但不用的：
 * - tile.openstreetmap.org：2026-09-16 從開發機連線一律逾時，地圖出不來這一頁就沒用了。
 * - CARTO basemaps：沒有金鑰時圖磚上會蓋「API KEY REQUIRED」浮水印。
 *
 * 伺服器有送完整憑證鏈（TWCA Global Root CA），不會踩到 gov.tw 常見的缺中繼憑證問題。
 * 圖磚只涵蓋臺灣，境外的位置會是空白底圖，路線與標記仍照常顯示。
 */
const TILE_URL = 'https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}';

/** 街道層級。17 大約看得到附近幾條巷子的名字，家人才對得上實際的路 */
const FOLLOW_ZOOM = 17;

/** 顏色一律從 tokens.css 讀，主題切換（深色、高對比）時跟著變 */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * 走失求救的地圖：目前位置（實心圓點＋誤差範圍）與走過的路線。長輩的定位頁另外
 * 標出正在過來的家人（companions）。
 *
 * 預設跟著最新位置移動；有家人時改成把所有人框進畫面。自己拖動地圖之後就不再搶
 * 畫面，改顯示「回到最新位置」。
 */
export default function LostMap({
  current,
  trail,
  companions = [],
  currentLabel,
  label,
  recenterLabel,
  attribution,
}: LostMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{
    trail: L.Polyline;
    accuracy: L.Circle;
    marker: L.CircleMarker;
    companions: L.LayerGroup;
  } | null>(null);
  const followRef = useRef(true);
  const [following, setFollowing] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, { zoomControl: true });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution }).addTo(map);
    const primary = token('--primary');
    const surface = token('--surface');
    layersRef.current = {
      trail: L.polyline([], { color: token('--accent'), weight: 5, opacity: 0.8 }).addTo(map),
      accuracy: L.circle([0, 0], {
        radius: 0,
        color: primary,
        weight: 1,
        fillColor: primary,
        fillOpacity: 0.15,
      }).addTo(map),
      marker: L.circleMarker([0, 0], {
        radius: 10,
        color: surface,
        weight: 3,
        fillColor: primary,
        fillOpacity: 1,
      }).addTo(map),
      companions: L.layerGroup().addTo(map),
    };
    map.on('dragstart', () => {
      followRef.current = false;
      setFollowing(false);
    });
    mapRef.current = map;

    map.attributionControl.setPrefix(false);
    // 頁面進場有滑入動畫，Leaflet 在建立當下量到的容器大小不準，圖磚會缺一塊
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 350);
    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
    // 語言切換要重建地圖才換得了來源標示；這一頁沒有切換語言的入口，只在掛載時建一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers || !current) return;

    const latest = L.latLng(current.latitude, current.longitude);
    layers.trail.setLatLngs(trail.map((point) => [point.latitude, point.longitude]));
    layers.marker.setLatLng(latest);
    layers.accuracy.setLatLng(latest);
    layers.accuracy.setRadius(current.accuracy ?? 0);
    layers.marker.unbindTooltip();
    if (currentLabel) {
      layers.marker.bindTooltip(currentLabel, { permanent: true, direction: 'top', offset: [0, -10] });
    }

    layers.companions.clearLayers();
    // 家人用 accent（橘）：primary 與 success 在預設主題都是深綠，放在一起分不出誰是誰。
    // 長輩的定位頁沒有路線（trail 也是 accent），不會撞色。
    const surface = token('--surface');
    const companionColor = token('--accent');
    for (const companion of companions) {
      L.circleMarker([companion.latitude, companion.longitude], {
        radius: 10,
        color: surface,
        weight: 3,
        fillColor: companionColor,
        fillOpacity: 1,
      })
        .bindTooltip(companion.label, { permanent: true, direction: 'top', offset: [0, -10] })
        .addTo(layers.companions);
    }

    if (followRef.current) fit(map);
    // fit 只讀 props，跟著 current／companions 變就夠了
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, trail, companions, currentLabel]);

  /** 只有自己時跟著走；有家人時把所有人框進畫面，但不拉得比街道層級更近 */
  function fit(map: L.Map) {
    if (!current) return;
    const latest = L.latLng(current.latitude, current.longitude);
    if (companions.length === 0) {
      map.setView(latest, Math.max(map.getZoom() || 0, FOLLOW_ZOOM));
      return;
    }
    const bounds = L.latLngBounds([latest, ...companions.map((c) => L.latLng(c.latitude, c.longitude))]);
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: FOLLOW_ZOOM });
  }

  const recenter = () => {
    followRef.current = true;
    setFollowing(true);
    if (mapRef.current) fit(mapRef.current);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        role="region"
        aria-label={label}
        className="h-[min(55dvh,26rem)] w-full overflow-hidden rounded-lg border border-border"
      />
      {!following && (
        <Button variant="outline" size="lg" onClick={recenter}>
          <LocateFixedIcon data-icon="inline-start" aria-hidden="true" />
          {recenterLabel}
        </Button>
      )}
    </div>
  );
}
