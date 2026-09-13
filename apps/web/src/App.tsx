import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { catalogs } from './i18n';
import type { Locale, PolicyKind, TranslationCatalog } from './i18n';

type Role = 'MEMBER' | 'ENTITY_ADMIN' | 'AWARD_ADMIN' | 'GLOBAL_ADMIN' | 'SYSTEM_BOOTSTRAP_ADMIN';
type Coordinates = { latitude: number; longitude: number };
type MapViewState = Coordinates & { zoom: number };
type LocationFields = { countryName: string; countryIso2: string; continentCode: string; region: string; locality: string };
type User = { id: string; email: string; displayName: string; callsign?: string; role: Role; locale: Locale };
type ApprovalScope = { countryCodes: string[]; continentCodes: string[]; allCountries: boolean };
type AdminUser = User & { callsign?: string; status: string; approvalScope: ApprovalScope };
type Park = { id: string; reference: string; countryIso2: string; continentCode: string; region?: string; locality?: string; latitude: string; longitude: string; parkType: string; name: string; description?: string; sourceUrl?: string; accessNotes?: string; photoUrl?: string; status?: string };
type ParkImage = { id: string; imageNumber: number; originalFilename: string; contentType: string; sizeBytes: number; createdAt: string; url: string };
type ParkActivation = { date: string; callsign: string; total_qsos: number; cw: number; data: number; phone: number; status: 'VALID' | 'FAILED' };
type ParkActivatorLeader = { callsign: string; display_name: string; activations: number; qsos: number };
type ParkHunterLeader = { callsign: string; qsos: number };
type ParkDetail = Park & { images: ParkImage[]; stats: { activationCount: number; totalQsos: number; firstActivation: string | null }; activations: ParkActivation[]; leaders: { activators: ParkActivatorLeader[]; hunters: ParkHunterLeader[] } };
type Proposal = Park & { status: string; reviewNotes?: string };
type Award = { id: string; key: string; name: string; description?: string; type: string; status: string; version: number };
type Duplicate = { kind: 'APPROVED_PARK' | 'PENDING_PROPOSAL'; id: string; reference?: string; name: string; distance_meters: number };
type ParkAdminPage = { items: Park[]; page: number; pageSize: number; total: number; totalPages: number };
type ParkSearch = { continentCode: string; countryIso2: string; region: string; locality: string };
type UploadRecord = { id: string; originalFilename: string; source: string; status: string; sizeBytes: number; contactCount: number; validCount: number; errorCount: number; uploadedAt: string; processedAt?: string | null; parkReference?: string | null; parkName?: string | null };
type RejectedQso = { id: string; qsoCallsign: string; qsoDatetime?: string | null; qsoDateUtc?: string | null; band?: string | null; mode?: string | null; validity: string; errorMessage?: string | null };
type QsoPreferences = { parkReference: string; frequency: string; mode: string };
type UserProfileData = { profile: { id: string; email: string; displayName: string; callsign?: string | null; locale: Locale; createdAt: string }; activations: Array<{ reference: string; name: string; date: string; qsos: number; status: 'VALID' | 'FAILED' }>; hunter: { summary: { total_qsos: number; parks: number; unique_hunters: number }; parks: Array<{ reference: string; name: string; qsos: number; last_contact: string }> }; awards: { progress: Array<{ award_id: string; current_value: number; required_value: number; status: string; key: string; name: string; type: string }>; grants: Array<{ award_id: string; award_version: number; granted_at: string; key: string; name: string; type: string }> } };
type AdminActivation = { activator_id: string; activator_callsign: string; park_reference: string; park_name: string; activation_date: string; valid_qsos: number; total_qsos: number; status: 'VALID' | 'FAILED' };
type NavItem = { id: string; label: string };

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
const TILE_URL = import.meta.env.VITE_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>';
const COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const CONTINENT_CODES = ['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA'];
const ROLE_OPTIONS: Role[] = ['MEMBER', 'ENTITY_ADMIN', 'AWARD_ADMIN', 'GLOBAL_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN'];

const PARK_MARKER = L.icon({ iconUrl: '/mpota-marker.svg', iconSize: [42, 42], iconAnchor: [21, 42], popupAnchor: [0, -38], className: 'mpota-marker-icon' });
const RETIRED_PARK_MARKER = L.icon({ iconUrl: '/mpota-marker-retired.svg', iconSize: [42, 42], iconAnchor: [21, 42], popupAnchor: [0, -38], className: 'mpota-marker-icon retired-marker-icon' });
const PROPOSAL_MARKER = L.divIcon({ className: 'proposal-marker', html: '<span><b>+</b></span>', iconSize: [34, 42], iconAnchor: [17, 42], popupAnchor: [0, -38] });

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Request failed');
  return body as T;
}

function SiteTopbar({ nav, activeTab, locale, user, t, onLocaleChange, onNavigate, onSignIn, onRegister, onSignOut }: { nav: NavItem[]; activeTab: string; locale: Locale; user: User | null; t: Record<string, string>; onLocaleChange: (locale: Locale) => void; onNavigate: (id: string) => void; onSignIn: () => void; onRegister: () => void; onSignOut: () => void }) {
  return <header className="topbar"><div className="brand"><img className="header-banner" src="/mpota-logo-banner.svg" alt="MPOTA — Municipal Parks On The Air" /></div><nav>{nav.map((item) => <button className={(activeTab === item.id || (activeTab === 'park-editor' && item.id === 'park-admin')) ? 'nav-active' : ''} key={item.id} onClick={() => onNavigate(item.id)}>{item.label}</button>)}</nav><div className="header-actions"><select aria-label={t.language} value={locale} onChange={(event) => onLocaleChange(event.target.value as Locale)}><option value="en">EN</option><option value="es">ES</option><option value="fr">FR</option><option value="de">DE</option></select>{user ? <><button className="user-pill" onClick={() => onNavigate('profile')}>{user.callsign || user.displayName}</button><button className="button ghost" onClick={onSignOut}>{t.signOut}</button></> : <><button className="button ghost" onClick={onSignIn}>{t.signIn}</button><button className="button" onClick={onRegister}>{t.register}</button></>}</div></header>;
}

function MapView({ parks, picking, selectedPoint, view, t, onPick, onViewChange, onParkSelect, onVisibleParksChange }: { parks: Park[]; picking: boolean; selectedPoint?: Coordinates; view: MapViewState; t: Record<string, string>; onPick: (lat: number, lon: number) => void; onViewChange: (view: MapViewState) => void; onParkSelect: (park: Park) => void; onVisibleParksChange: (parks: Park[]) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const parksLayer = useRef<L.MarkerClusterGroup | null>(null);
  const selectionLayer = useRef<L.LayerGroup | null>(null);
  const pickingRef = useRef(picking);
  const onPickRef = useRef(onPick);
  const onViewChangeRef = useRef(onViewChange);
  const onParkSelectRef = useRef(onParkSelect);
  const onVisibleParksChangeRef = useRef(onVisibleParksChange);
  const parksRef = useRef(parks);
  const tRef = useRef(t);
  const initialViewRef = useRef(view);
  useEffect(() => { pickingRef.current = picking; onPickRef.current = onPick; onViewChangeRef.current = onViewChange; onParkSelectRef.current = onParkSelect; onVisibleParksChangeRef.current = onVisibleParksChange; parksRef.current = parks; tRef.current = t; }, [picking, onPick, onViewChange, onParkSelect, onVisibleParksChange, parks, t]);
  const updateVisibleParks = () => {
    if (!map.current) return;
    const bounds = map.current.getBounds();
    onVisibleParksChangeRef.current(parksRef.current.filter((park) => bounds.contains([Number(park.latitude), Number(park.longitude)])).slice(0, 20));
  };
  useEffect(() => {
    if (!element.current || map.current) return;
    const initialView = initialViewRef.current;
    map.current = L.map(element.current).setView([initialView.latitude, initialView.longitude], initialView.zoom);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map.current);
    parksLayer.current = L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      removeOutsideVisibleBounds: true,
      maxClusterRadius: 55,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        const size = count < 10 ? 42 : count < 100 ? 48 : 56;
        return L.divIcon({
          html: `<span>${count}</span>`,
          className: 'mpota-cluster',
          iconSize: [size, size]
        });
      }
    }).addTo(map.current);
    selectionLayer.current = L.layerGroup().addTo(map.current);
    const locateControl = new L.Control({ position: 'topleft' });
    locateControl.onAdd = () => {
      const button = L.DomUtil.create('button', 'map-locate-control');
      button.type = 'button';
      button.textContent = '⌖';
      button.title = tRef.current.goToLocation;
      button.setAttribute('aria-label', tRef.current.goToLocation);
      L.DomEvent.disableClickPropagation(button);
      L.DomEvent.on(button, 'click', () => {
        if (!navigator.geolocation) {
          button.title = tRef.current.geolocationUnavailable;
          return;
        }
        button.classList.add('is-loading');
        button.title = tRef.current.findingLocation;
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            button.classList.remove('is-loading');
            button.title = tRef.current.goToLocation;
            // Leaflet zoom 14 shows approximately a 5 km neighborhood at typical MPOTA latitudes.
            map.current?.setView([coords.latitude, coords.longitude], 14);
          },
          () => {
            button.classList.remove('is-loading');
            button.title = tRef.current.locationPermissionUnavailable;
            window.setTimeout(() => { button.title = tRef.current.goToLocation; }, 3000);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      });
      return button;
    };
    locateControl.addTo(map.current);
    map.current.on('click', (event) => { if (pickingRef.current) onPickRef.current(event.latlng.lat, event.latlng.lng); });
    const saveView = () => { const center = map.current!.getCenter(); onViewChangeRef.current({ latitude: center.lat, longitude: center.lng, zoom: map.current!.getZoom() }); };
    map.current.on('moveend zoomend', saveView);
    map.current.on('moveend zoomend', updateVisibleParks);
    updateVisibleParks();
    return () => { map.current?.remove(); map.current = null; parksLayer.current = null; selectionLayer.current = null; };
  }, []);
  useEffect(() => {
    if (!parksLayer.current) return;
    parksRef.current = parks;
    parksLayer.current.clearLayers();
    parks.forEach((park) => {
      const popup = document.createElement('div');
      const reference = document.createElement('button');
      reference.type = 'button';
      reference.className = 'popup-reference';
      reference.textContent = park.reference;
      reference.addEventListener('click', () => onParkSelectRef.current(park));
      const name = document.createElement('div');
      name.className = 'popup-name';
      name.textContent = park.name;
      popup.append(reference, name);
      L.marker([Number(park.latitude), Number(park.longitude)], { icon: park.status === 'RETIRED' ? RETIRED_PARK_MARKER : PARK_MARKER }).bindPopup(popup).addTo(parksLayer.current!);
    });
    updateVisibleParks();
  }, [parks]);
  useEffect(() => {
    if (!selectionLayer.current) return;
    selectionLayer.current.clearLayers();
    if (picking && selectedPoint) L.marker([selectedPoint.latitude, selectedPoint.longitude], { icon: PROPOSAL_MARKER, zIndexOffset: 1000 }).bindTooltip(t.proposalLocation, { direction: 'top', offset: [0, -36] }).addTo(selectionLayer.current);
  }, [picking, selectedPoint, t]);
  return <div className={`map ${picking ? 'map-picking' : ''}`} ref={element} />;
}

function ModerationPanel({ proposals, token, t, onRefresh, onMessage }: { proposals: Proposal[]; token: string; t: Record<string, string>; onRefresh: () => void; onMessage: (message: string) => void }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const decide = async (proposal: Proposal, action: 'approve' | 'reject') => {
    try {
      await request(`/proposals/${proposal.id}/${action}`, { method: 'POST', body: JSON.stringify({ notes: notes[proposal.id] || undefined }) }, token);
      onMessage(action === 'approve' ? `${proposal.name} approved.` : `${proposal.name} rejected.`);
      onRefresh();
    } catch (error) { onMessage((error as Error).message); }
  };
  return <section className="admin-sections">
    <div className="panel"><div className="panel-heading"><div><p className="eyebrow">{t.scopedModeration}</p><h2>{t.proposalQueue}</h2></div><button className="button ghost" onClick={onRefresh}>{t.refresh}</button></div><div className="queue">{proposals.length ? proposals.map((proposal) => <article className="queue-row" key={proposal.id}><div className="queue-content"><span className="badge">{proposal.countryIso2} · {proposal.continentCode}</span><h3>{proposal.name}</h3><p className="muted">{proposal.locality || proposal.region || t.locationNotSpecified} · {Number(proposal.latitude).toFixed(5)}, {Number(proposal.longitude).toFixed(5)}</p><textarea aria-label={t.reviewNotes} rows={2} placeholder={t.reviewNotes} value={notes[proposal.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [proposal.id]: event.target.value }))} /></div><div className="row-actions"><button className="button" onClick={() => decide(proposal, 'approve')}>{t.approve}</button><button className="button danger" onClick={() => decide(proposal, 'reject')}>{t.reject}</button></div></article>) : <p className="muted">{t.noPending}</p>}</div></div>
  </section>;
}

function ParkEditorPage({ parkId, token, t, onClose, onSaved }: { parkId: string; token: string; t: Record<string, string>; onClose: () => void; onSaved: () => void }) {
  const [park, setPark] = useState<Park | null>(null);
  const [view, setView] = useState<MapViewState | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    request<Park>('/admin/parks/' + parkId, {}, token).then((result) => {
      setPark(result);
      setView({ latitude: Number(result.latitude), longitude: Number(result.longitude), zoom: 16 });
    }).catch((error) => setMessage((error as Error).message));
  }, [parkId, token]);
  const updateField = (field: keyof Park, value: string) => setPark((current) => current ? { ...current, [field]: value } : current);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!park) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      countryIso2: park.countryIso2, continentCode: park.continentCode, region: park.region || null, locality: park.locality || null,
      latitude: Number(park.latitude), longitude: Number(park.longitude), parkType: park.parkType, name: park.name,
      description: park.description || null, sourceUrl: park.sourceUrl || null, accessNotes: park.accessNotes || null, photoUrl: park.photoUrl || null
    };
    try {
      await request('/admin/parks/' + park.id, { method: 'PATCH', body: JSON.stringify(payload) }, token);
      onSaved();
    } catch (error) { setMessage((error as Error).message); }
    finally { setSaving(false); }
  };
  const changeStatus = async () => {
    if (!park) return;
    const retiring = park.status !== 'RETIRED' && park.status !== 'ARCHIVED';
    const reason = retiring ? window.prompt('Reason for retiring ' + park.reference + ':', 'Retired by park administrator') : null;
    if (retiring && reason === null) return;
    setSaving(true);
    try {
      const updated = await request<Park>('/admin/parks/' + park.id + (retiring ? '/retire' : '/activate'), { method: 'POST', body: retiring ? JSON.stringify({ notes: reason }) : undefined }, token);
      setPark(updated);
      setMessage(retiring ? park.reference + ' retired. Historical QSOs remain valid.' : park.reference + ' activated. New QSOs are enabled.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setSaving(false); }
  };
  if (!park || !view) return <div className="editor-window"><div className="editor-loading">{message || t.loading}</div></div>;
  const inactive = park.status === 'RETIRED' || park.status === 'ARCHIVED';
  return <div className="editor-window"><header className="editor-header"><div><p className="eyebrow">{t.parkAdministration}</p><h1>{t.edit} {park.reference}</h1></div><div className="editor-header-actions"><span className={`editor-status ${inactive ? 'editor-status-inactive' : 'editor-status-active'}`}>{inactive ? t.inactive : t.active}</span><button type="button" className={inactive ? 'button' : 'button danger'} onClick={changeStatus} disabled={saving}>{inactive ? t.setActive : t.retire}</button><button type="submit" form="park-editor-form" className="button" disabled={saving}>{saving ? t.saving : t.save}</button><button type="button" className="button ghost" onClick={onClose}>{t.discard}</button></div></header>{message && <div className="notice">{message}</div>}<main className="editor-layout"><section className="panel editor-map-panel"><div className="panel-heading"><div><p className="eyebrow">{t.location}</p><h2>{t.moveMarker}</h2><p className="map-hint">{t.clickMap}</p></div><span className="badge">{Number(park.latitude).toFixed(5)}, {Number(park.longitude).toFixed(5)}</span></div><MapView parks={[park]} picking t={t} selectedPoint={{ latitude: Number(park.latitude), longitude: Number(park.longitude) }} view={view} onViewChange={setView} onParkSelect={() => undefined} onVisibleParksChange={() => undefined} onPick={(latitude, longitude) => setPark((current) => current ? { ...current, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) } : current)} /></section><form id="park-editor-form" className="panel editor-form" onSubmit={save}><div className="coordinate-grid"><label>{t.latitude}<input value={Number(park.latitude).toFixed(6)} readOnly /></label><label>{t.longitude}<input value={Number(park.longitude).toFixed(6)} readOnly /></label></div><label>{t.reference}<input value={park.reference} readOnly /></label><label>{t.countryCode}<input value={park.countryIso2} readOnly /></label><label>{t.continentCode}<input value={park.continentCode} readOnly /></label><label>{t.region}<input value={park.region || ''} onChange={(event) => updateField('region', event.target.value)} /></label><label>{t.municipality}<input value={park.locality || ''} onChange={(event) => updateField('locality', event.target.value)} /></label><label>{t.parkName}<input value={park.name} required minLength={2} onChange={(event) => updateField('name', event.target.value)} /></label><label>{t.type}<select value={park.parkType} onChange={(event) => updateField('parkType', event.target.value)}><option value="MUNICIPAL_PARK">Municipal park</option><option value="URBAN_FOREST">Urban forest</option><option value="BOTANICAL_GARDEN">Botanical garden</option></select></label><label>{t.description}<textarea rows={4} value={park.description || ''} onChange={(event) => updateField('description', event.target.value)} /></label><label>{t.sourceUrl} <span className="optional">{t.optional}</span><input type="url" value={park.sourceUrl || ''} onChange={(event) => updateField('sourceUrl', event.target.value)} /></label><label>{t.accessNotes}<textarea rows={3} value={park.accessNotes || ''} onChange={(event) => updateField('accessNotes', event.target.value)} /></label><label>{t.photoUrl} <span className="optional">{t.optional}</span><input type="url" value={park.photoUrl || ''} onChange={(event) => updateField('photoUrl', event.target.value)} /></label><div className="row-actions editor-actions">{inactive ? <button type="button" className="button" onClick={changeStatus} disabled={saving}>{t.setActive}</button> : <button type="button" className="button danger" onClick={changeStatus} disabled={saving}>{t.retire}</button>}<button type="button" className="button ghost" onClick={onClose}>{t.discard}</button><button type="submit" className="button" disabled={saving}>{saving ? t.saving : t.save}</button></div></form></main></div>;
}

function ParkAdminPanel({ token, t, onEdit, onMessage }: { token: string; t: Record<string, string>; onEdit: (park: Park) => void; onMessage: (message: string) => void }) {
  const [search, setSearch] = useState<ParkSearch>({ continentCode: '', countryIso2: '', region: '', locality: '' });
  const [appliedSearch, setAppliedSearch] = useState<ParkSearch>({ continentCode: '', countryIso2: '', region: '', locality: '' });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ParkAdminPage>({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
  useEffect(() => {
    let active = true;
    const load = () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      Object.entries(appliedSearch).forEach(([key, value]) => { if (value.trim()) params.set(key, value.trim()); });
      request<ParkAdminPage>('/admin/parks?' + params.toString(), {}, token).then((data) => { if (active) setResult(data); }).catch((error) => { if (active) onMessage((error as Error).message); });
    };
    load();
    window.addEventListener('focus', load);
    return () => { active = false; window.removeEventListener('focus', load); };
  }, [token, page, appliedSearch, onMessage]);
  const submitSearch = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setPage(1); setAppliedSearch({ ...search }); };
  return <section className="admin-sections"><div className="panel"><div className="panel-heading"><div><p className="eyebrow">{t.scopedEntityManagement}</p><h2>{t.parkAdministration}</h2><p className="muted">{t.onlyAllowedParks}</p></div><span className="badge">{result.total} {t.parks}</span></div><form className="park-search" onSubmit={submitSearch}><label>{t.continent}<input value={search.continentCode} placeholder="EU" onChange={(event) => setSearch((current) => ({ ...current, continentCode: event.target.value }))} /></label><label>{t.country}<input value={search.countryIso2} placeholder="ES" onChange={(event) => setSearch((current) => ({ ...current, countryIso2: event.target.value }))} /></label><label>{t.region}<input value={search.region} placeholder="Andalucía" onChange={(event) => setSearch((current) => ({ ...current, region: event.target.value }))} /></label><label>{t.municipality}<input value={search.locality} placeholder="Madrid" onChange={(event) => setSearch((current) => ({ ...current, locality: event.target.value }))} /></label><button className="button" type="submit">{t.search}</button></form><div className="park-admin-list">{result.items.length ? result.items.map((park) => <article className="park-admin-row" key={park.id}><button className="park-admin-select" onClick={() => onEdit(park)}><span className="reference">{park.reference}</span><strong>{park.name}</strong><span>{park.locality || t.localityNotSpecified} · {park.region || t.regionNotSpecified}</span><small>{park.countryIso2} · {park.continentCode} · {park.status}</small></button><div className="row-actions"><button className="button" onClick={() => onEdit(park)}>{t.edit}</button></div></article>) : <p className="muted">{t.noParksScope}</p>}</div><div className="pagination"><button className="button ghost" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{t.previous}</button><span>{t.page} {result.totalPages ? page : 0} {t.of} {result.totalPages || 0} · {result.total} {t.parks}</span><button className="button ghost" disabled={!result.totalPages || page >= result.totalPages} onClick={() => setPage((current) => current + 1)}>{t.next}</button></div></div></section>;
}

function ParkDetailsModal({ park, token, onClose, onMessage }: { park: Park; token: string; onClose: () => void; onMessage: (message: string) => void }) {
  const [images, setImages] = useState<ParkImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadImages = async () => {
    try {
      const result = await request<{ parkReference: string; images: ParkImage[] }>(`/parks/${encodeURIComponent(park.reference)}/images`);
      setImages(result.images);
    } catch (error) {
      onMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadImages(); }, [park.reference]);

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem('park-image') as HTMLInputElement;
    if (!input.files?.[0]) return;
    const body = new FormData();
    body.append('file', input.files[0]);
    setUploading(true);
    try {
      await request(`/parks/${encodeURIComponent(park.reference)}/images`, { method: 'POST', body }, token);
      input.value = '';
      await loadImages();
      onMessage('Park image uploaded.');
    } catch (error) {
      onMessage((error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal park-details-modal" role="dialog" aria-modal="true" aria-labelledby="park-details-title"><button className="modal-close" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">MPOTA reference</p><span className="reference">{park.reference}</span><h2 id="park-details-title">{park.name}</h2><dl className="park-details-grid"><div><dt>Country</dt><dd>{park.countryIso2}</dd></div><div><dt>Continent</dt><dd>{park.continentCode}</dd></div><div><dt>Region</dt><dd>{park.region || '—'}</dd></div><div><dt>Locality</dt><dd>{park.locality || '—'}</dd></div><div><dt>Type</dt><dd>{park.parkType.replaceAll('_', ' ')}</dd></div><div><dt>Coordinates</dt><dd>{Number(park.latitude).toFixed(6)}, {Number(park.longitude).toFixed(6)}</dd></div></dl>{park.description && <section><h3>Description</h3><p className="muted details-copy">{park.description}</p></section>}{park.accessNotes && <section><h3>Access notes</h3><p className="muted details-copy">{park.accessNotes}</p></section>}<section className="park-images-section"><div className="section-heading"><h3>Park images</h3><span className="muted">{images.length} image{images.length === 1 ? '' : 's'}</span></div>{loading ? <p className="muted">Loading images…</p> : images.length ? <div className="park-image-grid">{images.map((image) => <a className="park-image-link" key={image.id} href={`${API}${image.url}`} target="_blank" rel="noopener noreferrer" title="Open full-size image"><img src={`${API}${image.url}`} alt={`${park.reference} image ${image.imageNumber}`} loading="lazy" /></a>)}</div> : <p className="muted">No user images have been uploaded yet.</p>}{token && park.status === 'APPROVED' && <form className="park-image-upload" onSubmit={upload}><label>Add an image<input name="park-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required /></label><p className="map-hint">JPEG, PNG, WebP, or GIF up to 10 MB.</p><button className="button" type="submit" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload image'}</button></form>}</section>{park.photoUrl && <p><a className="detail-link" href={park.photoUrl} target="_blank" rel="noopener noreferrer">Open external photo in a new window ↗</a></p>}{park.sourceUrl && <p><a className="detail-link" href={park.sourceUrl} target="_blank" rel="noopener noreferrer">Open source URL in a new window ↗</a></p>}</div></div>;
}

function ParkDetailPage({ reference, token, t, onBack, onMessage, nav, activeTab, locale, user, onLocaleChange, onNavigate, onSignIn, onRegister, onSignOut }: { reference: string; token: string; t: Record<string, string>; onBack: () => void; onMessage: (message: string) => void; nav: NavItem[]; activeTab: string; locale: Locale; user: User | null; onLocaleChange: (locale: Locale) => void; onNavigate: (id: string) => void; onSignIn: () => void; onRegister: () => void; onSignOut: () => void }) {
  const [detail, setDetail] = useState<ParkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setDetail(await request<ParkDetail>(`/parks/${encodeURIComponent(reference)}/detail`));
    } catch (error) {
      onMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [reference]);

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detail) return;
    const input = event.currentTarget.elements.namedItem('park-image') as HTMLInputElement;
    if (!input.files?.[0]) return;
    const body = new FormData();
    body.append('file', input.files[0]);
    setUploading(true);
    try {
      await request(`/parks/${encodeURIComponent(detail.reference)}/images`, { method: 'POST', body }, token);
      input.value = '';
      await load();
      onMessage('Park image uploaded.');
    } catch (error) {
      onMessage((error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const detailTopbar = <><SiteTopbar nav={nav} activeTab={activeTab} locale={locale} user={user} t={t} onLocaleChange={onLocaleChange} onNavigate={onNavigate} onSignIn={onSignIn} onRegister={onRegister} onSignOut={onSignOut} /><div className="detail-actionbar"><button className="button ghost" onClick={onBack}>← {t.back}</button></div></>;
  if (loading) return <div className="detail-page-shell">{detailTopbar}<main className="detail-loading">Loading park details…</main></div>;
  if (!detail) return <div className="detail-page-shell">{detailTopbar}<main className="detail-loading"><p>Park details could not be loaded.</p><button className="button" onClick={() => void load()}>Try again</button></main></div>;

  const imageUrl = (image: ParkImage) => `${API}${image.url}`;
  const statusLabel = detail.status === 'RETIRED' ? 'Inactive' : 'Active';
  const statusClass = detail.status === 'RETIRED' ? 'detail-intro-inactive' : '';
  return <div className="detail-page-shell">{detailTopbar}<main className="park-detail-page"><section className={`detail-intro ${statusClass}`}><div><p className="eyebrow">{t.parkInformation}</p><span className="detail-reference">{detail.reference}</span><h1>{detail.name}</h1><p className="detail-location">{[detail.locality, detail.region, detail.countryIso2].filter(Boolean).join(' · ')}</p></div><span className={`detail-status ${detail.status === 'RETIRED' ? 'detail-status-inactive' : ''}`}>{statusLabel}</span></section><div className="detail-layout"><div className="detail-main-column"><section className="detail-card image-card"><div className="detail-card-heading"><div><p className="eyebrow">{t.communityGallery}</p><h2>{t.parkImages}</h2></div><span className="detail-count">{detail.images.length}</span></div>{detail.images.length ? <div className="detail-image-grid">{detail.images.map((image) => <a key={image.id} href={imageUrl(image)} target="_blank" rel="noopener noreferrer" title={t.openFullSize}><img src={imageUrl(image)} alt={`${detail.reference} ${t.parkImages.toLowerCase()} ${image.imageNumber}`} loading="lazy" /></a>)}</div> : <p className="muted">{t.noImages}</p>}{token && detail.status === 'APPROVED' && <form className="detail-upload-form" onSubmit={upload}><label>{t.addImage}<input name="park-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required /></label><span className="map-hint">{t.imageFormats}</span><button className="button" type="submit" disabled={uploading}>{uploading ? t.uploading : t.uploadImage}</button></form>}{token && detail.status !== 'APPROVED' && <p className="map-hint">{t.activeOnlyImages}</p>}</section><section className="detail-card"><div className="detail-card-heading"><div><p className="eyebrow">{t.parkInformation}</p><h2>{t.parkInformation}</h2></div></div><dl className="detail-facts"><div><dt>{t.reference}</dt><dd>{detail.reference}</dd></div><div><dt>{t.country}</dt><dd>{detail.countryIso2}</dd></div><div><dt>{t.continent}</dt><dd>{detail.continentCode}</dd></div><div><dt>{t.region}</dt><dd>{detail.region || '—'}</dd></div><div><dt>{t.locality}</dt><dd>{detail.locality || '—'}</dd></div><div><dt>{t.type}</dt><dd>{detail.parkType.replaceAll('_', ' ')}</dd></div><div><dt>{t.latitude}</dt><dd>{Number(detail.latitude).toFixed(6)}</dd></div><div><dt>{t.longitude}</dt><dd>{Number(detail.longitude).toFixed(6)}</dd></div><div><dt>{t.status}</dt><dd>{statusLabel}</dd></div></dl>{detail.description && <div className="detail-copy-block"><h3>{t.description}</h3><p className="muted details-copy">{detail.description}</p></div>}{detail.accessNotes && <div className="detail-copy-block"><h3>{t.accessNotes}</h3><p className="muted details-copy">{detail.accessNotes}</p></div>}{detail.sourceUrl && <a className="detail-link" href={detail.sourceUrl} target="_blank" rel="noopener noreferrer">{t.openOfficialSource} ↗</a>}{detail.photoUrl && <a className="detail-link" href={detail.photoUrl} target="_blank" rel="noopener noreferrer">{t.openExternalPhoto} ↗</a>}</section><section className="detail-card"><div className="detail-card-heading"><div><p className="eyebrow">{t.communityActivity}</p><h2>{t.activations}</h2></div><span className="detail-count">{detail.stats.activationCount}</span></div>{detail.activations.length ? <div className="activation-table-wrap"><table className="activation-table"><thead><tr><th>{t.date}</th><th>{t.callsign}</th><th>{t.status}</th><th>{t.cw}</th><th>{t.data}</th><th>{t.phone}</th><th>{t.totalQsos}</th></tr></thead><tbody>{detail.activations.map((activation) => <tr key={`${activation.date}-${activation.callsign}`}><td>{activation.date}</td><td className="callsign-cell">{activation.callsign}</td><td><span className={`activation-status activation-status-${activation.status.toLowerCase()}`}>{activation.status === 'FAILED' ? t.failed : t.valid}</span></td><td>{activation.cw}</td><td>{activation.data}</td><td>{activation.phone}</td><td><strong>{activation.total_qsos}</strong></td></tr>)}</tbody></table></div> : <p className="muted">{t.noActivations}</p>}</section></div><aside className="detail-side-column"><section className="detail-card detail-map-card"><div className="detail-card-heading"><div><p className="eyebrow">{t.location}</p><h2>{t.location}</h2></div></div><MapView parks={[detail]} picking={false} t={t} view={{ latitude: Number(detail.latitude), longitude: Number(detail.longitude), zoom: 14 }} onViewChange={() => undefined} onParkSelect={() => undefined} onVisibleParksChange={() => undefined} onPick={() => undefined} /></section><section className="detail-card stats-card"><p className="eyebrow">{t.parkInformation}</p><div className="stat-grid"><div><strong>{detail.stats.activationCount}</strong><span>{t.activations}</span></div><div><strong>{detail.stats.totalQsos}</strong><span>{t.validQsos} {t.qsos}</span></div><div><strong>{detail.stats.firstActivation || '—'}</strong><span>{t.firstActivation}</span></div></div></section><section className="detail-card leaders-card"><div className="detail-card-heading"><div><p className="eyebrow">{t.communityActivity}</p><h2>{t.parkLeaders}</h2></div></div><div className="leader-group"><h3>{t.activators}</h3>{detail.leaders.activators.length ? detail.leaders.activators.map((leader, index) => <div className="leader-row" key={`${leader.callsign}-${index}`}><span className="leader-rank">{index + 1}</span><div><strong>{leader.callsign}</strong><small>{leader.activations} {t.activations.toLowerCase()}</small></div><b>{leader.qsos} {t.qsos}</b></div>) : <p className="muted">{t.noActivators}</p>}</div><div className="leader-group"><h3>{t.hunters}</h3>{detail.leaders.hunters.length ? detail.leaders.hunters.map((leader, index) => <div className="leader-row" key={`${leader.callsign}-${index}`}><span className="leader-rank">{index + 1}</span><div><strong>{leader.callsign}</strong><small>{t.hunterSummary}</small></div><b>{leader.qsos}</b></div>) : <p className="muted">{t.noHunters}</p>}</div></section></aside></div></main><footer><span>MPOTA · Municipal Parks on the Air</span><span>OpenStreetMap attribution and usage policy apply.</span></footer></div>;
}

function UsersPanel({ users, currentUserId, token, t, onRefresh, onMessage }: { users: AdminUser[]; currentUserId?: string; token: string; t: Record<string, string>; onRefresh: () => void; onMessage: (message: string) => void }) {
  const [drafts, setDrafts] = useState<Record<string, ApprovalScope & { role: Role }>>({});
  useEffect(() => { setDrafts(Object.fromEntries(users.map((user) => [user.id, { role: user.role, countryCodes: user.approvalScope?.countryCodes ?? [], continentCodes: user.approvalScope?.continentCodes ?? [], allCountries: user.approvalScope?.allCountries ?? false }]))); }, [users]);
  const updateDraft = (id: string, patch: Partial<ApprovalScope & { role: Role }>) => setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const saveAccess = async (user: AdminUser) => { try { await request(`/admin/users/${user.id}/access`, { method: 'PATCH', body: JSON.stringify(drafts[user.id]) }, token); onMessage(`${user.email} access updated.`); onRefresh(); } catch (error) { onMessage((error as Error).message); } };
  const changeStatus = async (user: AdminUser, action: 'deactivate' | 'delete') => { if (!window.confirm(`${action === 'delete' ? 'Delete' : 'Deactivate'} ${user.email}?`)) return; try { await request(`/admin/users/${user.id}${action === 'delete' ? '' : '/deactivate'}`, { method: action === 'delete' ? 'DELETE' : 'POST' }, token); onMessage(`${user.email} ${action}d.`); onRefresh(); } catch (error) { onMessage((error as Error).message); } };
  return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Global administration</p><h2>{t.users}</h2></div><button className="button ghost" onClick={onRefresh}>Refresh</button></div><div className="user-list">{users.length ? users.map((user) => { const draft = drafts[user.id] ?? { role: user.role, countryCodes: [], continentCodes: [], allCountries: false }; const self = user.id === currentUserId; return <article className="user-admin-row" key={user.id}><div className="user-summary"><span className="badge">{user.status}</span><h3>{user.displayName} {user.callsign && <small>· {user.callsign}</small>}</h3><p className="muted">{user.email}</p></div><div className="user-access"><label>{t.role}<select value={draft.role} onChange={(event) => updateDraft(user.id, { role: event.target.value as Role })}>{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><label className="checkbox-row"><input type="checkbox" checked={draft.allCountries} onChange={(event) => updateDraft(user.id, { allCountries: event.target.checked })} /> {t.allCountries}</label><label>{t.countryScope}<select multiple size={5} disabled={draft.allCountries} value={draft.countryCodes} onChange={(event) => updateDraft(user.id, { countryCodes: Array.from(event.target.selectedOptions, (option) => option.value) })}>{COUNTRY_CODES.map((code) => <option key={code} value={code}>{code}</option>)}</select></label><label>{t.continentScope}<select multiple size={4} disabled={draft.allCountries} value={draft.continentCodes} onChange={(event) => updateDraft(user.id, { continentCodes: Array.from(event.target.selectedOptions, (option) => option.value) })}>{CONTINENT_CODES.map((code) => <option key={code} value={code}>{code}</option>)}</select></label><div className="row-actions"><button className="button" onClick={() => saveAccess(user)}>{t.saveAccess}</button><button className="button ghost" disabled={self || user.status !== 'ACTIVE'} onClick={() => changeStatus(user, 'deactivate')}>{t.deactivate}</button><button className="button danger" disabled={self || user.status === 'DELETED'} onClick={() => changeStatus(user, 'delete')}>{t.delete}</button></div></div></article>; }) : <p className="muted">{t.noUsers}</p>}</div></section>;
}

function ManualQsoPage({ parks, token, t, onSignIn, onMessage }: { parks: Park[]; token: string; t: Record<string, string>; onSignIn: () => void; onMessage: (message: string) => void }) {
  const [preferences, setPreferences] = useState<QsoPreferences>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('mpota-qso-preferences') || '{}') as Partial<QsoPreferences>;
      return { parkReference: stored.parkReference || '', frequency: stored.frequency || '', mode: stored.mode || '' };
    } catch {
      return { parkReference: '', frequency: '', mode: '' };
    }
  });
  const [qsoCallsign, setQsoCallsign] = useState('');
  const [utcNow, setUtcNow] = useState(() => new Date());
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setUtcNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!preferences.parkReference && parks[0]) setPreferences((current) => ({ ...current, parkReference: parks[0].reference }));
  }, [parks, preferences.parkReference]);
  const updatePreference = (field: keyof QsoPreferences, value: string) => setPreferences((current) => ({ ...current, [field]: value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!preferences.parkReference || !preferences.frequency || !preferences.mode || !qsoCallsign) return;
    const submittedPreferences = { ...preferences };
    setSaving(true);
    try {
      const result = await request<{ accepted: boolean; errorMessage?: string }>(`/parks/${encodeURIComponent(preferences.parkReference)}/qsos`, {
        method: 'POST',
        body: JSON.stringify({ qsoCallsign, qsoDatetime: new Date().toISOString(), frequency: preferences.frequency, mode: preferences.mode })
      }, token);
      localStorage.setItem('mpota-qso-preferences', JSON.stringify(submittedPreferences));
      onMessage(result.accepted ? 'QSO accepted.' : `QSO rejected: ${result.errorMessage || 'validation failed'}`);
      setQsoCallsign('');
      setUtcNow(new Date());
    } catch (error) {
      onMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  if (!token) return <section className="single-panel panel"><p className="eyebrow">Activator tools</p><h2>{t.qso}</h2><div className="login-callout"><p>{t.loginRequired}</p><button className="button" onClick={onSignIn}>{t.signIn}</button></div></section>;
  return <section className="single-panel panel manual-qso-page"><div className="manual-qso-intro"><div><p className="eyebrow">Activator tools</p><h2>{t.qso}</h2><p className="muted">Log one hunter contact at a time. The timestamp is captured automatically in UTC; entity, frequency, and mode remain selected for the next QSO.</p></div><div className="utc-clock"><span>Current UTC</span><strong>{utcNow.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')}</strong></div></div><form className="manual-qso-form" onSubmit={submit}><label>Entity<select value={preferences.parkReference} onChange={(event) => updatePreference('parkReference', event.target.value)} required><option value="" disabled>Select an approved park</option>{parks.map((park) => <option value={park.reference} key={park.id}>{park.reference} · {park.name}</option>)}</select></label><label>Hunter callsign<input value={qsoCallsign} onChange={(event) => setQsoCallsign(event.target.value.toUpperCase())} required minLength={3} maxLength={32} placeholder="EA7KPG" autoComplete="off" /></label><div className="coordinate-grid"><label>Frequency (MHz)<input value={preferences.frequency} onChange={(event) => updatePreference('frequency', event.target.value)} required placeholder="14.074" inputMode="decimal" /></label><label>Mode<input value={preferences.mode} onChange={(event) => updatePreference('mode', event.target.value.toUpperCase())} required placeholder="FT8" /></label></div><label>QSO time (UTC)<input value={utcNow.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')} readOnly aria-readonly="true" /></label><button className="button" type="submit" disabled={saving || !parks.length}>{saving ? 'Saving…' : 'Log QSO'}</button></form></section>;
}

function QsoAdminPage({ token, t, onMessage }: { token: string; t: Record<string, string>; onMessage: (message: string) => void }) {
  const [filters, setFilters] = useState({ date: '', activatorCallsign: '', parkReference: '' });
  const [rows, setRows] = useState<AdminActivation[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (nextFilters = filters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams(Object.entries(nextFilters).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]));
      setRows(await request<AdminActivation[]>(`/admin/qsos/activations?${params.toString()}`, {}, token));
    } catch (error) { onMessage((error as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [token]);

  const deleteActivation = async (row: AdminActivation) => {
    const message = `Delete all ${row.total_qsos} stored QSOs for ${row.activator_callsign} at ${row.park_reference} on ${row.activation_date} UTC? This cannot be undone.`;
    if (!window.confirm(message)) return;
    try {
      const params = new URLSearchParams({ date: row.activation_date, activatorId: row.activator_id, parkReference: row.park_reference });
      const result = await request<{ deletedCount: number }>(`/admin/qsos/activations?${params.toString()}`, { method: 'DELETE' }, token);
      onMessage(`${result.deletedCount} QSO${result.deletedCount === 1 ? '' : 's'} deleted and affected award progress recalculated.`);
      await load();
    } catch (error) { onMessage((error as Error).message); }
  };

  return <section className="single-panel panel qso-admin-page"><div className="section-heading"><div><p className="eyebrow">Global administration</p><h2>QSO administration</h2><p className="muted">Failed activations remain visible here for audit. Deletion removes every stored QSO for the selected activator, entity, and UTC date; upload metadata is retained.</p></div><span className="badge">{rows.length} activations</span></div><form className="qso-admin-filters" onSubmit={(event) => { event.preventDefault(); void load(); }}><label>Date (UTC)<input type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} /></label><label>Activator callsign<input value={filters.activatorCallsign} onChange={(event) => setFilters({ ...filters, activatorCallsign: event.target.value })} placeholder="Partial match" /></label><label>Entity<input value={filters.parkReference} onChange={(event) => setFilters({ ...filters, parkReference: event.target.value.toUpperCase() })} placeholder="MPES-00002" /></label><button className="button" type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button></form>{rows.length ? <div className="qso-admin-list">{rows.map((row) => <article className="qso-admin-row" key={`${row.activator_id}-${row.park_reference}-${row.activation_date}`}><div className="qso-admin-cell"><small>Activation</small><strong>{row.activation_date} UTC</strong><span>{row.activator_callsign}</span></div><div className="qso-admin-cell"><small>Entity</small><strong>{row.park_reference}</strong><span>{row.park_name}</span></div><div className="qso-admin-cell"><small>QSOs</small><strong>{row.valid_qsos} valid / {row.total_qsos} total</strong><span className={`activation-status activation-status-${row.status.toLowerCase()}`}>{row.status === 'FAILED' ? 'Failed' : 'Valid'}</span></div><button className="button danger" type="button" onClick={() => void deleteActivation(row)}>Delete QSOs</button></article>)}</div> : <p className="muted">{loading ? 'Loading activations…' : 'No activation records match the search.'}</p>}</section>;
}

function ProfilePage({ token, user, locale, t, onUserChange, onMessage }: { token: string; user: User; locale: Locale; t: Record<string, string>; onUserChange: (user: User) => void; onMessage: (message: string) => void }) {
  const [data, setData] = useState<UserProfileData | null>(null);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [callsign, setCallsign] = useState(user.callsign || '');
  const [profileLocale, setProfileLocale] = useState<Locale>(locale);
  const [saving, setSaving] = useState(false);
  const load = () => request<UserProfileData>('/profile', {}, token).then((result) => { setData(result); setDisplayName(result.profile.displayName); setCallsign(result.profile.callsign || ''); setProfileLocale(result.profile.locale); }).catch((error) => onMessage((error as Error).message));
  useEffect(() => { void load(); }, [token]);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await request<User>('/profile', { method: 'PATCH', body: JSON.stringify({ displayName, callsign, locale: profileLocale }) }, token);
      onUserChange(updated);
      onMessage('Profile updated. Matching historical hunter QSOs have been attributed and awards recalculated.');
      await load();
    } catch (error) { onMessage((error as Error).message); }
    finally { setSaving(false); }
  };
  if (!data) return <section className="single-panel panel profile-page"><div className="editor-loading">Loading profile…</div></section>;
  const summary = data.hunter.summary;
  const validActivations = data.activations.filter((activation) => activation.status === 'VALID').length;
  return <section className="profile-page"><div className="profile-heading"><div><p className="eyebrow">Your MPOTA account</p><h1>{data.profile.callsign || data.profile.displayName}</h1><p className="muted">Manage your public identity and review your activations, hunter contacts, and awards.</p></div><span className="badge">{user.role}</span></div><div className="profile-layout"><form className="panel profile-form" onSubmit={save}><div className="panel-heading"><div><p className="eyebrow">Identity</p><h2>Edit profile</h2></div></div><label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={2} /></label><label>Callsign<input value={callsign} onChange={(event) => setCallsign(event.target.value.toUpperCase())} placeholder="EA7KLK" /></label><label>Language<select value={profileLocale} onChange={(event) => setProfileLocale(event.target.value as Locale)}><option value="en">English</option><option value="es">Español</option><option value="fr">Français</option><option value="de">Deutsch</option></select></label><label>Email<input value={data.profile.email} readOnly /></label><button className="button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></form><div className="profile-summary"><section className="panel"><p className="eyebrow">Hunter summary</p><h2>{summary.total_qsos} valid QSOs</h2><div className="profile-stat-grid"><div><strong>{summary.parks}</strong><span>parks contacted</span></div><div><strong>{summary.unique_hunters}</strong><span>callsigns</span></div></div>{data.hunter.parks.length ? <div className="profile-table-wrap"><table className="activation-table"><thead><tr><th>Entity</th><th>QSOs</th><th>Last contact</th></tr></thead><tbody>{data.hunter.parks.map((park) => <tr key={park.reference}><td><strong>{park.reference}</strong><br /><small>{park.name}</small></td><td>{park.qsos}</td><td>{new Date(park.last_contact).toLocaleDateString()}</td></tr>)}</tbody></table></div> : <p className="muted">No attributed hunter QSOs yet.</p>}</section><section className="panel"><p className="eyebrow">Activations</p><h2>{validActivations} valid activations</h2>{data.activations.length ? <div className="profile-table-wrap"><table className="activation-table"><thead><tr><th>Date</th><th>Entity</th><th>QSOs</th><th>Status</th></tr></thead><tbody>{data.activations.map((park) => <tr key={`${park.reference}-${park.date}`}><td>{park.date}</td><td><strong>{park.reference}</strong><br /><small>{park.name}</small></td><td>{park.qsos}</td><td><span className={`activation-status activation-status-${park.status.toLowerCase()}`}>{park.status === 'FAILED' ? 'Failed' : 'Valid'}</span></td></tr>)}</tbody></table></div> : <p className="muted">No activations recorded yet.</p>}</section><section className="panel"><p className="eyebrow">Awards</p><h2>{data.awards.grants.length} earned</h2>{data.awards.progress.length ? <div className="award-progress-list">{data.awards.progress.map((award) => <div className="award-progress-row" key={award.award_id}><div><strong>{award.name}</strong><small>{award.type} · {award.current_value} / {award.required_value}</small></div><span className="badge">{award.status}</span></div>)}</div> : <p className="muted">No award progress yet.</p>}</section></div></div></section>;
}

function PolicyPage({ kind, locale, onBack }: { kind: PolicyKind; locale: Locale; onBack: () => void }) {
  const page = catalogs[locale].policies[kind];
  return <section className="policy-page"><div className="policy-heading"><div><p className="eyebrow">{page.eyebrow}</p><h1>{page.title}</h1><p className="policy-intro">{page.intro}</p></div><button className="button ghost" onClick={onBack}>{page.back}</button></div><div className="policy-sections">{page.sections.map((section) => <section className="policy-section" key={section.title}><h2>{section.title}</h2>{section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}</section>)}</div></section>;
}

function HomePage({ parks, t, locale, token, onMap, onPropose, onQso, onSignIn, onPolicy }: { parks: Park[]; t: Record<string, string>; locale: Locale; token: string; onMap: () => void; onPropose: () => void; onQso: () => void; onSignIn: () => void; onPolicy: (kind: PolicyKind) => void }) {
  const eligibility = catalogs[locale].homeEligibility;
  const conduct = catalogs[locale].policies.conduct;
  const rules = catalogs[locale].policies.rules;
  return <section className="home-page"><div className="home-hero"><div className="home-hero-copy"><p className="eyebrow">{t.homeEyebrow}</p><h1>{t.homeTitle}</h1><p className="home-mission">{t.homeMission}</p><div className="home-actions"><button className="button" onClick={onMap}>{t.homeExplore} <span aria-hidden="true">→</span></button><button className="button ghost" onClick={onPropose}>{t.propose}</button>{token ? <button className="text-action" onClick={onQso}>{t.qso} <span aria-hidden="true">↗</span></button> : <button className="text-action" onClick={onSignIn}>{t.signIn} <span aria-hidden="true">↗</span></button>}</div></div><div className="home-signal-card"><div className="home-signal-mark">◎</div><p>{t.homeCommunity}</p><div className="home-signal-line"><span>{parks.length}</span><small>{t.approved}</small></div></div></div><div className="home-feature-grid"><article className="home-feature-card"><span className="home-feature-number">01</span><h2>{t.homeDiscoverTitle}</h2><p>{t.homeDiscoverText}</p><button className="text-action" onClick={onMap}>{t.map} <span aria-hidden="true">→</span></button></article><article className="home-feature-card feature-highlight"><span className="home-feature-number">02</span><h2>{t.homeContributeTitle}</h2><p>{t.homeContributeText}</p><button className="text-action" onClick={onPropose}>{t.propose} <span aria-hidden="true">→</span></button></article><article className="home-feature-card"><span className="home-feature-number">03</span><h2>{t.homeEarnTitle}</h2><p>{t.homeEarnText}</p><button className="text-action" onClick={token ? onQso : onSignIn}>{token ? t.qso : t.signIn} <span aria-hidden="true">↗</span></button></article></div><div className="home-why"><div className="home-why-mark">MP<span>OTA</span></div><div><p className="eyebrow">{t.homeWhyEyebrow}</p><h2>{t.homeWhyTitle}</h2><p>{t.homeWhyText}</p></div></div><div className="home-eligibility"><div className="home-eligibility-mark">POTA<span>≠</span>MPOTA</div><div><p className="eyebrow">{eligibility.eyebrow}</p><h2>{eligibility.title}</h2><p>{eligibility.text}</p></div></div><div className="home-policy-links"><button className="home-policy-link" onClick={() => onPolicy('conduct')}><span className="home-feature-number">04</span><h2>{conduct.title}</h2><p>{conduct.intro}</p><span className="text-action">{conduct.title} →</span></button><button className="home-policy-link" onClick={() => onPolicy('rules')}><span className="home-feature-number">05</span><h2>{rules.title}</h2><p>{rules.intro}</p><span className="text-action">{rules.title} →</span></button></div></section>;
}

function flattenTranslations(value: unknown, prefix = '', result: Record<string, string> = {}) {
  if (typeof value === 'string') {
    result[prefix] = value;
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => flattenTranslations(item, `${prefix}[${index}]`, result));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => flattenTranslations(item, prefix ? `${prefix}.${key}` : key, result));
  }
  return result;
}

function TranslationMaintenancePage({ locale, t }: { locale: Locale; t: Record<string, string> }) {
  const [selectedLocale, setSelectedLocale] = useState<Locale>(locale);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const sourceKeys = useMemo(() => Object.keys(flattenTranslations(catalogs.en)), []);
  const sourceCatalog = catalogs[selectedLocale] as TranslationCatalog;
  const sourceValues = useMemo(() => flattenTranslations(sourceCatalog), [sourceCatalog]);
  useEffect(() => {
    const storageKey = `mpota-translation-drafts-${selectedLocale}`;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || 'null') as Record<string, string> | null;
      setDrafts(stored || sourceValues);
    } catch {
      setDrafts(sourceValues);
    }
  }, [selectedLocale, sourceValues]);
  const filteredKeys = sourceKeys.filter((key) => !search.trim() || `${key} ${drafts[key] || sourceValues[key]}`.toLowerCase().includes(search.toLowerCase()));
  const updateDraft = (key: string, value: string) => {
    setDrafts((current) => {
      const next = { ...current, [key]: value };
      localStorage.setItem(`mpota-translation-drafts-${selectedLocale}`, JSON.stringify(next));
      return next;
    });
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(drafts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mpota-${selectedLocale}-translations.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const copyJson = async () => { await navigator.clipboard?.writeText(JSON.stringify(drafts, null, 2)); };
  return <section className="single-panel panel translation-maintenance"><div className="section-heading"><div><p className="eyebrow">{t.globalAdministration}</p><h2>{t.translationMaintenance}</h2><p className="muted">{t.translationAudit}</p></div><span className="badge">{sourceKeys.length} keys</span></div><div className="translation-toolbar"><label>{t.language}<select value={selectedLocale} onChange={(event) => setSelectedLocale(event.target.value as Locale)}><option value="en">English</option><option value="es">Español</option><option value="fr">Français</option><option value="de">Deutsch</option></select></label><label>{t.search}<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.searchTranslations} /></label><div className="row-actions"><button className="button ghost" type="button" onClick={() => void copyJson()}>{t.copyJson}</button><button className="button" type="button" onClick={exportJson}>{t.downloadJson}</button></div></div><p className="translation-note">{t.draftSaved}</p><div className="translation-list">{filteredKeys.length ? filteredKeys.map((key) => <label className="translation-row" key={key}><span>{key}</span><textarea rows={2} value={drafts[key] ?? sourceValues[key] ?? ''} onChange={(event) => updateDraft(key, event.target.value)} /></label>) : <p className="muted">{t.noMatches}</p>}</div></section>;
}

function parkReferenceFromLocation() {
  const match = window.location.pathname.match(/^\/parks\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function App() {
  const [locale, setLocale] = useState<Locale>((localStorage.getItem('mpota-locale') as Locale) || 'en');
  const [token, setToken] = useState(localStorage.getItem('mpota-token') || '');
  const [user, setUser] = useState<User | null>(null);
  const [parks, setParks] = useState<Park[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [rejectedQsos, setRejectedQsos] = useState<RejectedQso[]>([]);
  const [selectedUploadId, setSelectedUploadId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).has('park') ? 'park-editor' : 'home');
  const [editingParkId, setEditingParkId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('park'));
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ duplicates: Duplicate[]; payload: Record<string, FormDataEntryValue> } | null>(null);
  const [point, setPoint] = useState<Coordinates>({ latitude: 40.4168, longitude: -3.7038 });
  const [mapView, setMapView] = useState<MapViewState>({ latitude: 40.4168, longitude: -3.7038, zoom: 3 });
  const [locationFields, setLocationFields] = useState<LocationFields>({ countryName: '', countryIso2: '', continentCode: '', region: '', locality: '' });
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [parkReference, setParkReference] = useState<string | null>(() => parkReferenceFromLocation());
  const [visibleParks, setVisibleParks] = useState<Park[]>([]);
  const locationRequest = useRef(0);
  const [message, setMessage] = useState('');
  const t = catalogs[locale].copy;
  const canModerate = Boolean(user && ['ENTITY_ADMIN', 'GLOBAL_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN'].includes(user.role));
  const canManageUsers = Boolean(user && ['GLOBAL_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN'].includes(user.role));
  const canAward = Boolean(user && ['AWARD_ADMIN', 'GLOBAL_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN'].includes(user.role));
  const canGlobalAdmin = canManageUsers;
  const qsoAdminLabel = t.qsoAdmin;

  const refresh = () => { request<Park[]>('/parks').then(setParks).catch(() => undefined); request<Award[]>('/awards').then(setAwards).catch(() => undefined); if (token) request<User>('/auth/me', {}, token).then(setUser).catch(() => { setToken(''); localStorage.removeItem('mpota-token'); }); };
  const loadQueue = () => { if (token) request<Proposal[]>('/proposals/queue', {}, token).then(setProposals).catch((error) => setMessage(error.message)); };
  const loadUsers = () => { if (token) request<AdminUser[]>('/admin/users', {}, token).then(setAdminUsers).catch((error) => setMessage(error.message)); };
  useEffect(refresh, [token]);
  useEffect(() => { localStorage.setItem('mpota-locale', locale); }, [locale]);
  useEffect(() => {
    if (tab !== 'uploads' || !token) return;
    const refreshUploads = () => request<UploadRecord[]>('/uploads', {}, token).then(setUploads).catch((error) => setMessage(error.message));
    refreshUploads();
    const timer = window.setInterval(refreshUploads, 3000);
    return () => window.clearInterval(timer);
  }, [tab, token]);
  useEffect(() => {
    const handleHistory = () => setParkReference(parkReferenceFromLocation());
    window.addEventListener('popstate', handleHistory);
    return () => window.removeEventListener('popstate', handleHistory);
  }, []);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { const result = await request<{ user: User; accessToken: string }>(authMode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) }); setToken(result.accessToken); localStorage.setItem('mpota-token', result.accessToken); setUser(result.user); setAuthMode(null); setMessage(''); } catch (error) { setMessage((error as Error).message); } };
  const resolveLocation = async (latitude: number, longitude: number) => {
    if (!token) return;
    const requestId = ++locationRequest.current;
    setIsResolvingLocation(true);
    try {
      const result = await request<LocationFields>('/proposals/reverse-geocode', { method: 'POST', body: JSON.stringify({ latitude, longitude }) }, token);
      if (requestId === locationRequest.current) setLocationFields((current) => ({ ...current, ...result }));
    } catch (error) { setMessage(`Location lookup unavailable: ${(error as Error).message}`); }
    finally { if (requestId === locationRequest.current) setIsResolvingLocation(false); }
  };
  const handleMapPick = (latitude: number, longitude: number) => {
    setPoint({ latitude, longitude });
    void resolveLocation(latitude, longitude);
  };
  const updateLocationField = (field: keyof LocationFields, value: string) => setLocationFields((current) => ({ ...current, [field]: value }));
  useEffect(() => {
    if (tab === 'propose' && token && !locationFields.countryIso2) void resolveLocation(point.latitude, point.longitude);
  }, [tab, token]);
  const sendProposal = async (payload: Record<string, FormDataEntryValue>) => {
    const normalizedPayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => String(value).trim() !== ''));
    await request('/proposals', { method: 'POST', body: JSON.stringify({ ...normalizedPayload, latitude: point.latitude, longitude: point.longitude }) }, token);
    setMessage('Proposal submitted for approval.');
  };
  const submitProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return setAuthMode('login');
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await request<{ duplicates: Duplicate[] }>('/proposals/duplicate-check', {
        method: 'POST',
        body: JSON.stringify({ latitude: point.latitude, longitude: point.longitude })
      }, token);
      if (result.duplicates.length) {
        setDuplicateWarning({ duplicates: result.duplicates, payload });
        return;
      }
      await sendProposal(payload);
    } catch (error) { setMessage((error as Error).message); }
  };
  const submitAward = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const value = Object.fromEntries(form); try { await request('/awards', { method: 'POST', body: JSON.stringify({ ...value, type: 'ACTIVATOR', allCountries: true, ruleDefinition: { minimumEntities: Number(value.minimumEntities || 1) } }) }, token); setMessage('Award draft created.'); refresh(); } catch (error) { setMessage((error as Error).message); } };
  const uploadAdif = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const park = String(form.get('parkReference') || '');
    const input = event.currentTarget.elements.namedItem('file') as HTMLInputElement;
    if (!park) return setMessage('Select the approved park for this ADIF file.');
    if (!input.files?.[0]) return;
    const body = new FormData();
    body.append('file', input.files[0]);
    try {
      await request(`/parks/${encodeURIComponent(park)}/uploads/adif`, { method: 'POST', body }, token);
      event.currentTarget.reset();
      setMessage('ADIF uploaded and queued for processing.');
    } catch (error) { setMessage((error as Error).message); }
  };
  const showRejectedQsos = async (upload: UploadRecord) => {
    if (!upload.errorCount) return;
    try {
      setRejectedQsos(await request<RejectedQso[]>(`/uploads/${upload.id}/rejected-qsos`, {}, token));
      setSelectedUploadId(upload.id);
    } catch (error) { setMessage((error as Error).message); }
  };

  const nav = useMemo(() => [{ id: 'home', label: t.home }, { id: 'map', label: t.map }, ...(user ? [{ id: 'propose', label: t.propose }, { id: 'qso', label: t.qso }, { id: 'uploads', label: t.uploads }] : []), { id: 'awards', label: t.awards }, ...(canModerate ? [{ id: 'admin', label: t.admin }, { id: 'park-admin', label: t.parkAdmin }] : []), ...(canGlobalAdmin ? [{ id: 'qso-admin', label: qsoAdminLabel }, { id: 'translations', label: t.translations }] : []), ...(canManageUsers ? [{ id: 'users', label: t.users }] : [])], [t, user, canModerate, canGlobalAdmin, canManageUsers, qsoAdminLabel]);
  const selectTab = (id: string) => { if (id !== 'park-editor' && editingParkId) { setEditingParkId(null); window.history.pushState({}, '', '/'); } setTab(id); if (id === 'admin') loadQueue(); if (id === 'users') loadUsers(); if (id !== 'uploads') { setSelectedUploadId(null); setRejectedQsos([]); } };
  const openPark = (park: Park) => { window.history.pushState({}, '', `/parks/${encodeURIComponent(park.reference)}`); setParkReference(park.reference); };
  const closePark = () => { window.history.pushState({}, '', '/'); setParkReference(null); };
  const openParkEditor = (park: Park) => { window.history.pushState({}, '', '/?park=' + encodeURIComponent(park.id)); setEditingParkId(park.id); setTab('park-editor'); };
  const closeParkEditor = () => { window.history.pushState({}, '', '/'); setEditingParkId(null); setTab('park-admin'); };
  if (parkReference) return <ParkDetailPage reference={parkReference} token={token} t={t} onBack={closePark} onMessage={setMessage} nav={nav} activeTab={tab} locale={locale} user={user} onLocaleChange={setLocale} onNavigate={(id) => { closePark(); selectTab(id); }} onSignIn={() => setAuthMode('login')} onRegister={() => setAuthMode('register')} onSignOut={() => { setToken(''); setUser(null); localStorage.removeItem('mpota-token'); }} />;

  return <div className="app-shell">
    <SiteTopbar nav={nav} activeTab={tab} locale={locale} user={user} t={t} onLocaleChange={setLocale} onNavigate={selectTab} onSignIn={() => setAuthMode('login')} onRegister={() => setAuthMode('register')} onSignOut={() => { setToken(''); setUser(null); localStorage.removeItem('mpota-token'); setTab('home'); }} />
    <main>{tab === 'park-editor' ? null : tab === 'home' ? <HomePage parks={parks} t={t} locale={locale} token={token} onMap={() => setTab('map')} onPropose={() => setTab('propose')} onQso={() => setTab('qso')} onSignIn={() => setAuthMode('login')} onPolicy={(kind) => setTab(kind)} /> : tab === 'conduct' ? <PolicyPage kind="conduct" locale={locale} onBack={() => setTab('home')} /> : tab === 'rules' ? <PolicyPage kind="rules" locale={locale} onBack={() => setTab('home')} /> : <><section className="hero"><div className="hero-copy"><p className="eyebrow">Municipal Parks on the Air</p><h1>{t.hero}</h1><p className="hero-text">{t.heroText}</p><div className="hero-actions"><button className="button" onClick={() => setTab('propose')}>{t.propose}</button><span className="stat"><strong>{parks.length}</strong> {t.approved}</span></div></div></section></>}
      {message && <div className="notice">{message}<button onClick={() => setMessage('')}>×</button></div>}
      {(tab === 'map' || tab === 'propose') && <section className="content-grid"><div className="panel map-panel"><div className="panel-heading"><div>{tab === 'map' ? <><p className="eyebrow">{t.liveCatalog}</p><h2>{t.map}</h2></> : <><p className="eyebrow">{t.locationFirst}</p><h2>{t.choose}</h2><p className="map-hint">{t.pickLocation}</p></>}</div><span className="badge">{tab === 'map' ? `${parks.length} ${t.entities}` : `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`}</span></div><MapView parks={parks} picking={tab === 'propose'} t={t} selectedPoint={tab === 'propose' ? point : undefined} view={mapView} onViewChange={setMapView} onParkSelect={openPark} onVisibleParksChange={setVisibleParks} onPick={tab === 'propose' ? handleMapPick : () => undefined} /></div>{tab === 'map' ? <aside className="panel side-panel"><p className="eyebrow">{t.approvedReferences}</p><h2>{t.exploreMpota}</h2><p className="muted">{t.onlyApprovedMap}</p><div className="park-list approved-reference-list">{visibleParks.map((park) => <button className="park-row" key={park.id} onClick={() => openPark(park)}><span className="reference">{park.reference}</span><span>{park.name}</span><small>{park.countryIso2} · {park.locality || park.region || t.municipalPark}</small></button>)}</div></aside> : <aside className="panel form-panel"><p className="eyebrow">{t.communityContribution}</p><h2>{t.propose}</h2>{token ? <form onSubmit={submitProposal}><div className="coordinate-grid"><label>{t.latitude}<input value={point.latitude.toFixed(6)} readOnly /></label><label>{t.longitude}<input value={point.longitude.toFixed(6)} readOnly /></label></div><label>{t.country}<input value={locationFields.countryName} placeholder={t.selectPointMap} readOnly /></label><label>{t.countryCode}<input name="countryIso2" required minLength={2} maxLength={2} placeholder="ES" value={locationFields.countryIso2} onChange={(event) => updateLocationField('countryIso2', event.target.value.toUpperCase())} /></label><label>{t.continentCode}<input name="continentCode" required placeholder="EU" value={locationFields.continentCode} onChange={(event) => updateLocationField('continentCode', event.target.value.toUpperCase())} /></label><label>{t.region}<input name="region" value={locationFields.region} onChange={(event) => updateLocationField('region', event.target.value)} /></label><label>{t.locality}<input name="locality" value={locationFields.locality} onChange={(event) => updateLocationField('locality', event.target.value)} /></label>{isResolvingLocation && <p className="map-hint">{t.lookupLocation}</p>}<label>{t.parkName}<input name="name" required placeholder={t.municipalParkName} /></label><label>{t.type}<select name="parkType"><option value="MUNICIPAL_PARK">{t.municipalPark}</option><option value="URBAN_FOREST">{t.urbanForest}</option><option value="BOTANICAL_GARDEN">{t.botanicalGarden}</option></select></label><label>{t.description}<textarea name="description" rows={3} /></label><label>{t.sourceUrl} <span className="optional">{t.optional}</span><input name="sourceUrl" type="url" placeholder="https://..." /></label><label>{t.accessNotes}<textarea name="accessNotes" rows={3} /></label><button className="button full" type="submit">{t.submit}</button></form> : <div className="login-callout"><p>{t.loginRequired}</p><button className="button" onClick={() => setAuthMode('login')}>{t.signIn}</button></div>}</aside>}</section>}
      {tab === 'qso' && <ManualQsoPage parks={parks} token={token} t={t} onSignIn={() => setAuthMode('login')} onMessage={setMessage} />}
      {tab === 'profile' && user && <ProfilePage token={token} user={user} locale={locale} t={t} onUserChange={(updated) => { setUser(updated); setLocale(updated.locale); }} onMessage={setMessage} />}
      {tab === 'uploads' && <section className="single-panel panel"><p className="eyebrow">Activator tools</p><h2>{t.uploads}</h2>{token ? <div className="log-tools-grid">
        <form className="upload-box" onSubmit={uploadAdif}><div className="upload-icon">↥</div><h3>Upload an ADIF log</h3><p className="muted">Choose the active MPOTA park where this activity took place. Processing runs through the QSO validation API.</p><label>Park<select name="parkReference" required defaultValue=""><option value="" disabled>Select an active park</option>{parks.filter((park) => park.status !== 'RETIRED').map((park) => <option value={park.reference} key={park.id}>{park.reference} · {park.name}</option>)}</select></label><input name="file" type="file" accept=".adi,.adif" required /><button className="button" type="submit">{t.upload}</button></form>
        <div className="upload-history"><div className="section-heading"><div><p className="eyebrow">Processing history</p><h3>Your ADIF uploads</h3></div><span className="badge">{uploads.length}</span></div>{uploads.length ? <div className="upload-list">{uploads.map((upload) => <button className={`upload-row ${upload.errorCount ? 'has-errors' : ''}`} type="button" key={upload.id} onClick={() => showRejectedQsos(upload)} disabled={!upload.errorCount}><span className="upload-file"><strong>{upload.originalFilename}</strong><small>{upload.parkReference || 'Park unavailable'} · {upload.parkName || ''}</small></span><span className={`upload-status upload-status-${upload.status.toLowerCase()}`}>{upload.status}</span><span className="upload-meta"><small>{new Date(upload.uploadedAt).toLocaleString()}</small><small>{(upload.sizeBytes / 1024).toFixed(1)} KB</small><small>{upload.validCount} valid · {upload.errorCount} invalid</small></span></button>)}</div> : <p className="muted">No ADIF files uploaded yet.</p>}</div>
        {selectedUploadId && <div className="rejected-qso-panel"><div className="section-heading"><div><p className="eyebrow">Validation details</p><h3>Rejected QSOs</h3></div><button className="button ghost" type="button" onClick={() => { setSelectedUploadId(null); setRejectedQsos([]); }}>Close</button></div>{rejectedQsos.length ? <div className="activation-table-wrap"><table className="activation-table"><thead><tr><th>Hunter</th><th>UTC</th><th>Band</th><th>Mode</th><th>Reason</th></tr></thead><tbody>{rejectedQsos.map((qso) => <tr key={qso.id}><td className="callsign-cell">{qso.qsoCallsign}</td><td>{qso.qsoDatetime ? new Date(qso.qsoDatetime).toISOString() : qso.qsoDateUtc || '—'}</td><td>{qso.band || '—'}</td><td>{qso.mode || '—'}</td><td><strong>{qso.validity}</strong><br /><small>{qso.errorMessage || 'Rejected'}</small></td></tr>)}</tbody></table></div> : <p className="muted">No rejected QSOs were returned.</p>}</div>}
      </div> : <div className="login-callout"><p>{t.loginRequired}</p><button className="button" onClick={() => setAuthMode('login')}>{t.signIn}</button></div>}</section>}
      {tab === 'awards' && <section className="content-grid"><div className="panel"><p className="eyebrow">Collect and qualify</p><h2>{t.awards}</h2><div className="award-grid">{awards.length ? awards.map((award) => <article className="award-card" key={award.id}><div className="award-icon">✦</div><div><span className="badge">{award.type}</span><h3>{award.name}</h3><p className="muted">{award.description || 'A published MPOTA award.'}</p></div></article>) : <p className="muted">No published awards yet.</p>}</div></div>{canAward && <aside className="panel form-panel"><p className="eyebrow">Award Admin</p><h2>{t.saveAward}</h2><form onSubmit={submitAward}><label>Key<input name="key" required placeholder="municipal-starter" /></label><label>Name<input name="name" required placeholder="Municipal Starter" /></label><label>Description<textarea name="description" rows={3} /></label><label>Minimum entities<input name="minimumEntities" type="number" min="1" defaultValue="1" /></label><button className="button full">{t.saveAward}</button></form></aside>}</section>}
      {tab === 'admin' && canModerate && <ModerationPanel proposals={proposals} token={token} t={t} onRefresh={loadQueue} onMessage={setMessage} />}
      {tab === 'park-admin' && canModerate && <ParkAdminPanel token={token} t={t} onEdit={openParkEditor} onMessage={setMessage} />}
      {tab === 'park-editor' && editingParkId && canModerate && <ParkEditorPage parkId={editingParkId} token={token} t={t} onClose={closeParkEditor} onSaved={() => { setMessage(t.parkChangesSaved); closeParkEditor(); }} />}
      {tab === 'qso-admin' && canGlobalAdmin && <QsoAdminPage token={token} t={t} onMessage={setMessage} />}
      {tab === 'translations' && canGlobalAdmin && <TranslationMaintenancePage locale={locale} t={t} />}
      {tab === 'users' && canManageUsers && <UsersPanel users={adminUsers} currentUserId={user?.id} token={token} t={t} onRefresh={loadUsers} onMessage={setMessage} />}
    </main>
    {duplicateWarning && <div className="modal-backdrop"><div className="modal duplicate-modal" role="alertdialog" aria-modal="true" aria-labelledby="duplicate-title"><button className="modal-close" onClick={() => setDuplicateWarning(null)} aria-label="Close">×</button><p className="eyebrow">Possible duplicate</p><h2 id="duplicate-title">Nearby MPOTA location</h2><p className="muted">An approved park or pending request is less than 150 metres from this point. Please check the entries before submitting.</p><div className="duplicate-list">{duplicateWarning.duplicates.map((duplicate) => <div className="duplicate-row" key={`${duplicate.kind}-${duplicate.id}`}><div><strong>{duplicate.reference || 'Pending request'}</strong><span>{duplicate.name}</span></div><small>{Number(duplicate.distance_meters).toFixed(1)} m away</small></div>)}</div><div className="row-actions"><button className="button ghost" onClick={() => setDuplicateWarning(null)}>Cancel</button><button className="button" onClick={async () => { try { await sendProposal(duplicateWarning.payload); setDuplicateWarning(null); } catch (error) { setMessage((error as Error).message); } }}>Submit anyway</button></div></div></div>}
    {authMode && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={() => setAuthMode(null)}>×</button><p className="eyebrow">MPOTA account</p><h2>{authMode === 'login' ? t.signIn : t.register}</h2><form onSubmit={submitAuth}><label>{t.email}<input name="email" type="email" required /></label><label>{t.password}<input name="password" type="password" minLength={8} required /></label>{authMode === 'register' && <><label>{t.name}<input name="displayName" required /></label><label>{t.callsign}<input name="callsign" /></label></>}<button className="button full">{authMode === 'login' ? t.signIn : t.register}</button></form><button className="link-button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? t.register : t.signIn}</button></div></div>}
    <footer><span>MPOTA · Municipal Parks on the Air</span><span>OpenStreetMap attribution and usage policy apply.</span></footer>
  </div>;
}
