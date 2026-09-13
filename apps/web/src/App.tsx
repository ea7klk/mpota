import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';

type Locale = 'en' | 'es' | 'fr' | 'de';
type Role = 'MEMBER' | 'ENTITY_ADMIN' | 'AWARD_ADMIN' | 'GLOBAL_ADMIN' | 'SYSTEM_BOOTSTRAP_ADMIN';
type Coordinates = { latitude: number; longitude: number };
type MapViewState = Coordinates & { zoom: number };
type LocationFields = { countryName: string; countryIso2: string; continentCode: string; region: string; locality: string };
type User = { id: string; email: string; displayName: string; role: Role; locale: Locale };
type ApprovalScope = { countryCodes: string[]; continentCodes: string[]; allCountries: boolean };
type AdminUser = User & { callsign?: string; status: string; approvalScope: ApprovalScope };
type Park = { id: string; reference: string; countryIso2: string; continentCode: string; region?: string; locality?: string; latitude: string; longitude: string; parkType: string; name: string; description?: string; sourceUrl?: string; accessNotes?: string; photoUrl?: string; status?: string };
type ParkImage = { id: string; imageNumber: number; originalFilename: string; contentType: string; sizeBytes: number; createdAt: string; url: string };
type ParkActivation = { date: string; callsign: string; total_qsos: number; cw: number; data: number; phone: number };
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

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
const TILE_URL = import.meta.env.VITE_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>';
const COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const CONTINENT_CODES = ['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA'];
const ROLE_OPTIONS: Role[] = ['MEMBER', 'ENTITY_ADMIN', 'AWARD_ADMIN', 'GLOBAL_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN'];

const PARK_MARKER = L.icon({ iconUrl: '/mpota-marker.svg', iconSize: [42, 42], iconAnchor: [21, 42], popupAnchor: [0, -38], className: 'mpota-marker-icon' });
const PROPOSAL_MARKER = L.divIcon({ className: 'proposal-marker', html: '<span><b>+</b></span>', iconSize: [34, 42], iconAnchor: [17, 42], popupAnchor: [0, -38] });

const copy: Record<Locale, Record<string, string>> = {
  en: { map: 'Map', propose: 'Propose a park', qso: 'Log QSO', uploads: 'ADIF uploads', awards: 'Awards', admin: 'Moderation', parkAdmin: 'Park administration', users: 'Users', signIn: 'Sign in', register: 'Register', signOut: 'Sign out', hero: 'Municipal parks on the air', heroText: 'Discover accessible places for amateur radio, propose a new park, and collect MPOTA awards.', approved: 'approved parks', choose: 'Choose a point on the map', submit: 'Submit proposal', email: 'Email', password: 'Password', name: 'Display name', callsign: 'Callsign', upload: 'Upload ADIF', loginRequired: 'Sign in to propose parks, upload logs, or manage MPOTA.', saveAward: 'Create award draft', proposalQueue: 'Proposal queue', approvedParks: 'Approved parks', remove: 'Remove', reviewNotes: 'Review notes', coordinates: 'Coordinates', pickLocation: 'Click the map to place the proposal marker.', access: 'Approval access', allCountries: 'All countries', countryScope: 'Countries', continentScope: 'Continents', saveAccess: 'Save access', deactivate: 'Deactivate', delete: 'Delete', noUsers: 'No users found', status: 'Status', role: 'Role' },
  es: { map: 'Mapa', propose: 'Proponer un parque', qso: 'Registrar QSO', uploads: 'Cargas ADIF', awards: 'Premios', admin: 'Moderación', parkAdmin: 'Administración de parques', users: 'Usuarios', signIn: 'Iniciar sesión', register: 'Registrarse', signOut: 'Cerrar sesión', hero: 'Parques municipales en el aire', heroText: 'Descubre lugares accesibles para la radioafición, propone un parque y consigue premios MPOTA.', approved: 'parques aprobados', choose: 'Elige un punto en el mapa', submit: 'Enviar propuesta', email: 'Correo', password: 'Contraseña', name: 'Nombre visible', callsign: 'Indicativo', upload: 'Cargar ADIF', loginRequired: 'Inicia sesión para proponer parques, cargar logs o gestionar MPOTA.', saveAward: 'Crear borrador de premio', proposalQueue: 'Cola de propuestas', approvedParks: 'Parques aprobados', remove: 'Retirar', reviewNotes: 'Notas de revisión', coordinates: 'Coordenadas', pickLocation: 'Haz clic en el mapa para colocar el marcador.', access: 'Acceso de aprobación', allCountries: 'Todos los países', countryScope: 'Países', continentScope: 'Continentes', saveAccess: 'Guardar acceso', deactivate: 'Desactivar', delete: 'Eliminar', noUsers: 'No se encontraron usuarios', status: 'Estado', role: 'Rol' },
  fr: { map: 'Carte', propose: 'Proposer un parc', qso: 'Enregistrer un QSO', uploads: 'Importations ADIF', awards: 'Récompenses', admin: 'Modération', parkAdmin: 'Administration des parcs', users: 'Utilisateurs', signIn: 'Connexion', register: "S'inscrire", signOut: 'Déconnexion', hero: 'Parcs municipaux sur les ondes', heroText: 'Découvrez des lieux accessibles pour la radio amateur, proposez un parc et obtenez des récompenses MPOTA.', approved: 'parcs approuvés', choose: 'Choisissez un point sur la carte', submit: 'Envoyer la proposition', email: 'E-mail', password: 'Mot de passe', name: 'Nom affiché', callsign: 'Indicatif', upload: 'Importer ADIF', loginRequired: 'Connectez-vous pour proposer des parcs, importer des logs ou gérer MPOTA.', saveAward: 'Créer un brouillon', proposalQueue: 'File des propositions', approvedParks: 'Parcs approuvés', remove: 'Retirer', reviewNotes: 'Notes de révision', coordinates: 'Coordonnées', pickLocation: 'Cliquez sur la carte pour placer le marqueur.', access: 'Accès d’approbation', allCountries: 'Tous les pays', countryScope: 'Pays', continentScope: 'Continents', saveAccess: 'Enregistrer l’accès', deactivate: 'Désactiver', delete: 'Supprimer', noUsers: 'Aucun utilisateur', status: 'Statut', role: 'Rôle' },
  de: { map: 'Karte', propose: 'Park vorschlagen', qso: 'QSO protokollieren', uploads: 'ADIF-Uploads', awards: 'Auszeichnungen', admin: 'Moderation', parkAdmin: 'Parkverwaltung', users: 'Benutzer', signIn: 'Anmelden', register: 'Registrieren', signOut: 'Abmelden', hero: 'Kommunale Parks auf der Luft', heroText: 'Entdecke zugängliche Orte für den Amateurfunk, schlage Parks vor und sammle MPOTA-Auszeichnungen.', approved: 'genehmigte Parks', choose: 'Punkt auf der Karte wählen', submit: 'Vorschlag senden', email: 'E-Mail', password: 'Passwort', name: 'Anzeigename', callsign: 'Rufzeichen', upload: 'ADIF hochladen', loginRequired: 'Anmelden, um Parks vorzuschlagen, Logs hochzuladen oder MPOTA zu verwalten.', saveAward: 'Auszeichnungsentwurf erstellen', proposalQueue: 'Vorschlagswarteschlange', approvedParks: 'Genehmigte Parks', remove: 'Entfernen', reviewNotes: 'Prüfnotizen', coordinates: 'Koordinaten', pickLocation: 'Klicke auf die Karte, um den Marker zu platzieren.', access: 'Genehmigungszugriff', allCountries: 'Alle Länder', countryScope: 'Länder', continentScope: 'Kontinente', saveAccess: 'Zugriff speichern', deactivate: 'Deaktivieren', delete: 'Löschen', noUsers: 'Keine Benutzer gefunden', status: 'Status', role: 'Rolle' }
};

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Request failed');
  return body as T;
}

function MapView({ parks, picking, selectedPoint, view, onPick, onViewChange, onParkSelect, onVisibleParksChange }: { parks: Park[]; picking: boolean; selectedPoint?: Coordinates; view: MapViewState; onPick: (lat: number, lon: number) => void; onViewChange: (view: MapViewState) => void; onParkSelect: (park: Park) => void; onVisibleParksChange: (parks: Park[]) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const parksLayer = useRef<L.LayerGroup | null>(null);
  const selectionLayer = useRef<L.LayerGroup | null>(null);
  const pickingRef = useRef(picking);
  const onPickRef = useRef(onPick);
  const onViewChangeRef = useRef(onViewChange);
  const onParkSelectRef = useRef(onParkSelect);
  const onVisibleParksChangeRef = useRef(onVisibleParksChange);
  const parksRef = useRef(parks);
  const initialViewRef = useRef(view);
  useEffect(() => { pickingRef.current = picking; onPickRef.current = onPick; onViewChangeRef.current = onViewChange; onParkSelectRef.current = onParkSelect; onVisibleParksChangeRef.current = onVisibleParksChange; parksRef.current = parks; }, [picking, onPick, onViewChange, onParkSelect, onVisibleParksChange, parks]);
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
    parksLayer.current = L.layerGroup().addTo(map.current);
    selectionLayer.current = L.layerGroup().addTo(map.current);
    const locateControl = new L.Control({ position: 'topleft' });
    locateControl.onAdd = () => {
      const button = L.DomUtil.create('button', 'map-locate-control');
      button.type = 'button';
      button.textContent = '⌖';
      button.title = 'Go to my location';
      button.setAttribute('aria-label', 'Go to my location');
      L.DomEvent.disableClickPropagation(button);
      L.DomEvent.on(button, 'click', () => {
        if (!navigator.geolocation) {
          button.title = 'Geolocation is not available in this browser';
          return;
        }
        button.classList.add('is-loading');
        button.title = 'Finding your location…';
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            button.classList.remove('is-loading');
            button.title = 'Go to my location';
            // Leaflet zoom 14 shows approximately a 5 km neighborhood at typical MPOTA latitudes.
            map.current?.setView([coords.latitude, coords.longitude], 14);
          },
          () => {
            button.classList.remove('is-loading');
            button.title = 'Location permission was unavailable';
            window.setTimeout(() => { button.title = 'Go to my location'; }, 3000);
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
      L.marker([Number(park.latitude), Number(park.longitude)], { icon: PARK_MARKER }).bindPopup(popup).addTo(parksLayer.current!);
    });
    updateVisibleParks();
  }, [parks]);
  useEffect(() => {
    if (!selectionLayer.current) return;
    selectionLayer.current.clearLayers();
    if (picking && selectedPoint) L.marker([selectedPoint.latitude, selectedPoint.longitude], { icon: PROPOSAL_MARKER, zIndexOffset: 1000 }).bindTooltip('Proposal location', { direction: 'top', offset: [0, -36] }).addTo(selectionLayer.current);
  }, [picking, selectedPoint]);
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
    <div className="panel"><div className="panel-heading"><div><p className="eyebrow">Scoped moderation</p><h2>{t.proposalQueue}</h2></div><button className="button ghost" onClick={onRefresh}>Refresh</button></div><div className="queue">{proposals.length ? proposals.map((proposal) => <article className="queue-row" key={proposal.id}><div className="queue-content"><span className="badge">{proposal.countryIso2} · {proposal.continentCode}</span><h3>{proposal.name}</h3><p className="muted">{proposal.locality || proposal.region || 'Location not specified'} · {Number(proposal.latitude).toFixed(5)}, {Number(proposal.longitude).toFixed(5)}</p><textarea aria-label={t.reviewNotes} rows={2} placeholder={t.reviewNotes} value={notes[proposal.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [proposal.id]: event.target.value }))} /></div><div className="row-actions"><button className="button" onClick={() => decide(proposal, 'approve')}>Approve</button><button className="button danger" onClick={() => decide(proposal, 'reject')}>Reject</button></div></article>) : <p className="muted">No pending proposals in your approval scope.</p>}</div></div>
  </section>;
}

function ParkEditorWindow({ parkId, token }: { parkId: string; token: string }) {
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
  const closeWindow = () => window.close();
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
      window.opener?.postMessage({ type: 'mpota-park-updated', parkId: park.id }, window.location.origin);
      window.close();
    } catch (error) { setMessage((error as Error).message); }
    finally { setSaving(false); }
  };
  if (!park || !view) return <div className="editor-window"><div className="editor-loading">{message || 'Loading park…'}</div></div>;
  return <div className="editor-window"><header className="editor-header"><div><p className="eyebrow">Park administration</p><h1>Edit {park.reference}</h1></div><button className="button ghost" onClick={closeWindow}>Discard</button></header>{message && <div className="notice">{message}</div>}<main className="editor-layout"><section className="panel editor-map-panel"><div className="panel-heading"><div><p className="eyebrow">Location</p><h2>Move the park marker</h2><p className="map-hint">Click the map to change the coordinates. Save or discard when finished.</p></div><span className="badge">{Number(park.latitude).toFixed(5)}, {Number(park.longitude).toFixed(5)}</span></div><MapView parks={[park]} picking selectedPoint={{ latitude: Number(park.latitude), longitude: Number(park.longitude) }} view={view} onViewChange={setView} onParkSelect={() => undefined} onVisibleParksChange={() => undefined} onPick={(latitude, longitude) => setPark((current) => current ? { ...current, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) } : current)} /></section><form className="panel editor-form" onSubmit={save}><div className="coordinate-grid"><label>Latitude<input value={Number(park.latitude).toFixed(6)} readOnly /></label><label>Longitude<input value={Number(park.longitude).toFixed(6)} readOnly /></label></div><label>Reference<input value={park.reference} readOnly /></label><label>Country code<input value={park.countryIso2} readOnly /></label><label>Continent code<input value={park.continentCode} readOnly /></label><label>Region<input value={park.region || ''} onChange={(event) => updateField('region', event.target.value)} /></label><label>Municipality / locality<input value={park.locality || ''} onChange={(event) => updateField('locality', event.target.value)} /></label><label>Park name<input value={park.name} required minLength={2} onChange={(event) => updateField('name', event.target.value)} /></label><label>Type<select value={park.parkType} onChange={(event) => updateField('parkType', event.target.value)}><option value="MUNICIPAL_PARK">Municipal park</option><option value="URBAN_FOREST">Urban forest</option><option value="BOTANICAL_GARDEN">Botanical garden</option></select></label><label>Description<textarea rows={4} value={park.description || ''} onChange={(event) => updateField('description', event.target.value)} /></label><label>Source URL <span className="optional">(optional)</span><input type="url" value={park.sourceUrl || ''} onChange={(event) => updateField('sourceUrl', event.target.value)} /></label><label>Access notes<textarea rows={3} value={park.accessNotes || ''} onChange={(event) => updateField('accessNotes', event.target.value)} /></label><label>Photo URL <span className="optional">(optional)</span><input type="url" value={park.photoUrl || ''} onChange={(event) => updateField('photoUrl', event.target.value)} /></label><div className="row-actions editor-actions"><button type="button" className="button ghost" onClick={closeWindow}>Discard changes</button><button type="submit" className="button" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div></form></main></div>;
}

function ParkAdminPanel({ token, canRemove, onMessage }: { token: string; canRemove: boolean; onMessage: (message: string) => void }) {
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
  useEffect(() => {
    const refreshAfterEdit = (event: MessageEvent) => { if (event.origin === window.location.origin && event.data?.type === 'mpota-park-updated') window.dispatchEvent(new Event('focus')); };
    window.addEventListener('message', refreshAfterEdit);
    return () => window.removeEventListener('message', refreshAfterEdit);
  }, []);
  const submitSearch = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setPage(1); setAppliedSearch({ ...search }); };
  const openEditor = (park: Park) => {
    const editorUrl = new URL(window.location.href);
    editorUrl.search = 'park=' + encodeURIComponent(park.id);
    const editorWindow = window.open(editorUrl.toString(), 'mpota-park-editor', 'popup,width=1200,height=900,resizable=yes,scrollbars=yes');
    if (!editorWindow) onMessage('The park editor window was blocked by the browser.');
    else editorWindow.focus();
  };
  const removePark = async (park: Park) => {
    const reason = window.prompt('Reason for removing ' + park.reference + ':', 'Removed by global administrator');
    if (reason === null) return;
    try { await request('/parks/' + park.id + '/remove', { method: 'POST', body: JSON.stringify({ notes: reason }) }, token); onMessage(park.reference + ' removed.'); window.dispatchEvent(new Event('focus')); } catch (error) { onMessage((error as Error).message); }
  };
  return <section className="admin-sections"><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Scoped entity management</p><h2>Park administration</h2><p className="muted">Only parks that you are allowed to edit are listed.</p></div><span className="badge">{result.total} parks</span></div><form className="park-search" onSubmit={submitSearch}><label>Continent<input value={search.continentCode} placeholder="EU" onChange={(event) => setSearch((current) => ({ ...current, continentCode: event.target.value }))} /></label><label>Country<input value={search.countryIso2} placeholder="ES" onChange={(event) => setSearch((current) => ({ ...current, countryIso2: event.target.value }))} /></label><label>Region<input value={search.region} placeholder="Andalucía" onChange={(event) => setSearch((current) => ({ ...current, region: event.target.value }))} /></label><label>Municipality / locality<input value={search.locality} placeholder="Madrid" onChange={(event) => setSearch((current) => ({ ...current, locality: event.target.value }))} /></label><button className="button" type="submit">Search</button></form><div className="park-admin-list">{result.items.length ? result.items.map((park) => <article className="park-admin-row" key={park.id}><button className="park-admin-select" onClick={() => openEditor(park)}><span className="reference">{park.reference}</span><strong>{park.name}</strong><span>{park.locality || 'Locality not specified'} · {park.region || 'Region not specified'}</span><small>{park.countryIso2} · {park.continentCode} · {park.status}</small></button><div className="row-actions"><button className="button" onClick={() => openEditor(park)}>Edit</button>{canRemove && <button className="button danger" onClick={() => removePark(park)}>Remove</button>}</div></article>) : <p className="muted">No parks found in your approval scope.</p>}</div><div className="pagination"><button className="button ghost" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {result.totalPages ? page : 0} of {result.totalPages || 0} · {result.total} parks</span><button className="button ghost" disabled={!result.totalPages || page >= result.totalPages} onClick={() => setPage((current) => current + 1)}>Next</button></div></div></section>;
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

  return <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal park-details-modal" role="dialog" aria-modal="true" aria-labelledby="park-details-title"><button className="modal-close" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">MPOTA reference</p><span className="reference">{park.reference}</span><h2 id="park-details-title">{park.name}</h2><dl className="park-details-grid"><div><dt>Country</dt><dd>{park.countryIso2}</dd></div><div><dt>Continent</dt><dd>{park.continentCode}</dd></div><div><dt>Region</dt><dd>{park.region || '—'}</dd></div><div><dt>Locality</dt><dd>{park.locality || '—'}</dd></div><div><dt>Type</dt><dd>{park.parkType.replaceAll('_', ' ')}</dd></div><div><dt>Coordinates</dt><dd>{Number(park.latitude).toFixed(6)}, {Number(park.longitude).toFixed(6)}</dd></div></dl>{park.description && <section><h3>Description</h3><p className="muted details-copy">{park.description}</p></section>}{park.accessNotes && <section><h3>Access notes</h3><p className="muted details-copy">{park.accessNotes}</p></section>}<section className="park-images-section"><div className="section-heading"><h3>Park images</h3><span className="muted">{images.length} image{images.length === 1 ? '' : 's'}</span></div>{loading ? <p className="muted">Loading images…</p> : images.length ? <div className="park-image-grid">{images.map((image) => <a className="park-image-link" key={image.id} href={`${API}${image.url}`} target="_blank" rel="noopener noreferrer" title="Open full-size image"><img src={`${API}${image.url}`} alt={`${park.reference} image ${image.imageNumber}`} loading="lazy" /></a>)}</div> : <p className="muted">No user images have been uploaded yet.</p>}{token && <form className="park-image-upload" onSubmit={upload}><label>Add an image<input name="park-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required /></label><p className="map-hint">JPEG, PNG, WebP, or GIF up to 10 MB.</p><button className="button" type="submit" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload image'}</button></form>}</section>{park.photoUrl && <p><a className="detail-link" href={park.photoUrl} target="_blank" rel="noopener noreferrer">Open external photo in a new window ↗</a></p>}{park.sourceUrl && <p><a className="detail-link" href={park.sourceUrl} target="_blank" rel="noopener noreferrer">Open source URL in a new window ↗</a></p>}</div></div>;
}

function ParkDetailPage({ reference, token, onBack, onMessage }: { reference: string; token: string; onBack: () => void; onMessage: (message: string) => void }) {
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

  if (loading) return <div className="detail-page-shell"><header className="detail-topbar"><img src="/mpota-logo-banner.svg" alt="MPOTA — Municipal Parks On The Air" /><button className="button ghost" onClick={onBack}>← Back to map</button></header><main className="detail-loading">Loading park details…</main></div>;
  if (!detail) return <div className="detail-page-shell"><header className="detail-topbar"><img src="/mpota-logo-banner.svg" alt="MPOTA — Municipal Parks On The Air" /><button className="button ghost" onClick={onBack}>← Back to map</button></header><main className="detail-loading"><p>Park details could not be loaded.</p><button className="button" onClick={() => void load()}>Try again</button></main></div>;

  const imageUrl = (image: ParkImage) => `${API}${image.url}`;
  return <div className="detail-page-shell"><header className="detail-topbar"><img src="/mpota-logo-banner.svg" alt="MPOTA — Municipal Parks On The Air" /><div className="detail-topbar-actions"><button className="button ghost" onClick={onBack}>← Back to map</button>{token ? <span className="detail-auth-state">Signed in</span> : null}</div></header><main className="park-detail-page"><section className="detail-intro"><div><p className="eyebrow">Municipal park profile</p><span className="detail-reference">{detail.reference}</span><h1>{detail.name}</h1><p className="detail-location">{[detail.locality, detail.region, detail.countryIso2].filter(Boolean).join(' · ')}</p></div><span className="detail-status">{detail.status}</span></section><div className="detail-layout"><div className="detail-main-column"><section className="detail-card image-card"><div className="detail-card-heading"><div><p className="eyebrow">Community gallery</p><h2>Park images</h2></div><span className="detail-count">{detail.images.length}</span></div>{detail.images.length ? <div className="detail-image-grid">{detail.images.map((image) => <a key={image.id} href={imageUrl(image)} target="_blank" rel="noopener noreferrer" title="Open full-size image"><img src={imageUrl(image)} alt={`${detail.reference} image ${image.imageNumber}`} loading="lazy" /></a>)}</div> : <p className="muted">No community images have been uploaded yet.</p>}{token && <form className="detail-upload-form" onSubmit={upload}><label>Add an image<input name="park-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required /></label><span className="map-hint">JPEG, PNG, WebP, or GIF up to 10 MB.</span><button className="button" type="submit" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload image'}</button></form>}</section><section className="detail-card"><div className="detail-card-heading"><div><p className="eyebrow">About this place</p><h2>Park information</h2></div></div><dl className="detail-facts"><div><dt>Reference</dt><dd>{detail.reference}</dd></div><div><dt>Country</dt><dd>{detail.countryIso2}</dd></div><div><dt>Continent</dt><dd>{detail.continentCode}</dd></div><div><dt>Region</dt><dd>{detail.region || '—'}</dd></div><div><dt>Locality</dt><dd>{detail.locality || '—'}</dd></div><div><dt>Type</dt><dd>{detail.parkType.replaceAll('_', ' ')}</dd></div><div><dt>Latitude</dt><dd>{Number(detail.latitude).toFixed(6)}</dd></div><div><dt>Longitude</dt><dd>{Number(detail.longitude).toFixed(6)}</dd></div><div><dt>Status</dt><dd>{detail.status}</dd></div></dl>{detail.description && <div className="detail-copy-block"><h3>Description</h3><p className="muted details-copy">{detail.description}</p></div>}{detail.accessNotes && <div className="detail-copy-block"><h3>Access notes</h3><p className="muted details-copy">{detail.accessNotes}</p></div>}{detail.sourceUrl && <a className="detail-link" href={detail.sourceUrl} target="_blank" rel="noopener noreferrer">Open official source ↗</a>}{detail.photoUrl && <a className="detail-link" href={detail.photoUrl} target="_blank" rel="noopener noreferrer">Open external photo ↗</a>}</section><section className="detail-card"><div className="detail-card-heading"><div><p className="eyebrow">Community activity</p><h2>Activations</h2></div><span className="detail-count">{detail.stats.activationCount}</span></div>{detail.activations.length ? <div className="activation-table-wrap"><table className="activation-table"><thead><tr><th>Date</th><th>Callsign</th><th>CW</th><th>Data</th><th>Phone</th><th>Total QSOs</th></tr></thead><tbody>{detail.activations.map((activation) => <tr key={`${activation.date}-${activation.callsign}`}><td>{activation.date}</td><td className="callsign-cell">{activation.callsign}</td><td>{activation.cw}</td><td>{activation.data}</td><td>{activation.phone}</td><td><strong>{activation.total_qsos}</strong></td></tr>)}</tbody></table></div> : <p className="muted">No activations have been recorded yet.</p>}</section></div><aside className="detail-side-column"><section className="detail-card detail-map-card"><div className="detail-card-heading"><div><p className="eyebrow">Find the park</p><h2>Location</h2></div></div><MapView parks={[detail]} picking={false} view={{ latitude: Number(detail.latitude), longitude: Number(detail.longitude), zoom: 14 }} onViewChange={() => undefined} onParkSelect={() => undefined} onVisibleParksChange={() => undefined} onPick={() => undefined} /></section><section className="detail-card stats-card"><p className="eyebrow">At a glance</p><div className="stat-grid"><div><strong>{detail.stats.activationCount}</strong><span>activations</span></div><div><strong>{detail.stats.totalQsos}</strong><span>valid QSOs</span></div><div><strong>{detail.stats.firstActivation || '—'}</strong><span>first activation</span></div></div></section><section className="detail-card leaders-card"><div className="detail-card-heading"><div><p className="eyebrow">Community contributors</p><h2>Park leaders</h2></div></div><div className="leader-group"><h3>Activators</h3>{detail.leaders.activators.length ? detail.leaders.activators.map((leader, index) => <div className="leader-row" key={`${leader.callsign}-${index}`}><span className="leader-rank">{index + 1}</span><div><strong>{leader.callsign}</strong><small>{leader.activations} activation{leader.activations === 1 ? '' : 's'}</small></div><b>{leader.qsos} QSOs</b></div>) : <p className="muted">No activator data yet.</p>}</div><div className="leader-group"><h3>Hunters</h3>{detail.leaders.hunters.length ? detail.leaders.hunters.map((leader, index) => <div className="leader-row" key={`${leader.callsign}-${index}`}><span className="leader-rank">{index + 1}</span><div><strong>{leader.callsign}</strong><small>hunter QSOs</small></div><b>{leader.qsos}</b></div>) : <p className="muted">No hunter data yet.</p>}</div></section></aside></div></main><footer><span>MPOTA · Municipal Parks on the Air</span><span>OpenStreetMap attribution and usage policy apply.</span></footer></div>;
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
  const [tab, setTab] = useState('map');
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
  const t = copy[locale];
  const canModerate = Boolean(user && ['ENTITY_ADMIN', 'GLOBAL_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN'].includes(user.role));
  const canManageUsers = Boolean(user && ['GLOBAL_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN'].includes(user.role));
  const canAward = Boolean(user && ['AWARD_ADMIN', 'GLOBAL_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN'].includes(user.role));

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
    await request('/proposals', { method: 'POST', body: JSON.stringify({ ...payload, latitude: point.latitude, longitude: point.longitude }) }, token);
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

  const nav = useMemo(() => [{ id: 'map', label: t.map }, { id: 'propose', label: t.propose }, { id: 'qso', label: t.qso }, { id: 'uploads', label: t.uploads }, { id: 'awards', label: t.awards }, ...(canModerate ? [{ id: 'admin', label: t.admin }, { id: 'park-admin', label: t.parkAdmin }] : []), ...(canManageUsers ? [{ id: 'users', label: t.users }] : [])], [t, canModerate, canManageUsers]);
  const selectTab = (id: string) => { setTab(id); if (id === 'admin') loadQueue(); if (id === 'users') loadUsers(); if (id !== 'uploads') { setSelectedUploadId(null); setRejectedQsos([]); } };
  const openPark = (park: Park) => { window.history.pushState({}, '', `/parks/${encodeURIComponent(park.reference)}`); setParkReference(park.reference); };
  const closePark = () => { window.history.pushState({}, '', '/'); setParkReference(null); };
  const parkEditId = new URLSearchParams(window.location.search).get('park');
  if (parkEditId) return <ParkEditorWindow parkId={parkEditId} token={token} />;
  if (parkReference) return <ParkDetailPage reference={parkReference} token={token} onBack={closePark} onMessage={setMessage} />;

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><img className="header-banner" src="/mpota-logo-banner.svg" alt="MPOTA — Municipal Parks On The Air" /></div><nav>{nav.map((item) => <button className={tab === item.id ? 'nav-active' : ''} key={item.id} onClick={() => selectTab(item.id)}>{item.label}</button>)}</nav><div className="header-actions"><select aria-label="Language" value={locale} onChange={(event) => setLocale(event.target.value as Locale)}><option value="en">EN</option><option value="es">ES</option><option value="fr">FR</option><option value="de">DE</option></select>{user ? <button className="user-pill" onClick={() => { setToken(''); setUser(null); localStorage.removeItem('mpota-token'); }}>{user.displayName} · {t.signOut}</button> : <><button className="button ghost" onClick={() => setAuthMode('login')}>{t.signIn}</button><button className="button" onClick={() => setAuthMode('register')}>{t.register}</button></>}</div></header>
    <main><section className="hero"><div className="hero-copy"><p className="eyebrow">Municipal Parks on the Air</p><h1>{t.hero}</h1><p className="hero-text">{t.heroText}</p><div className="hero-actions"><button className="button" onClick={() => setTab('propose')}>{t.propose}</button><span className="stat"><strong>{parks.length}</strong> {t.approved}</span></div></div><div className="hero-card"><div className="signal">◎</div><div><strong>MPES-00001</strong><span>Ready for the community</span></div></div></section>
      {message && <div className="notice">{message}<button onClick={() => setMessage('')}>×</button></div>}
      {(tab === 'map' || tab === 'propose') && <section className="content-grid"><div className="panel map-panel"><div className="panel-heading"><div>{tab === 'map' ? <><p className="eyebrow">Live catalog</p><h2>{t.map}</h2></> : <><p className="eyebrow">Location first</p><h2>{t.choose}</h2><p className="map-hint">{t.pickLocation}</p></>}</div><span className="badge">{tab === 'map' ? `${parks.length} entities` : `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`}</span></div><MapView parks={parks} picking={tab === 'propose'} selectedPoint={tab === 'propose' ? point : undefined} view={mapView} onViewChange={setMapView} onParkSelect={openPark} onVisibleParksChange={setVisibleParks} onPick={tab === 'propose' ? handleMapPick : () => undefined} /></div>{tab === 'map' ? <aside className="panel side-panel"><p className="eyebrow">Approved references</p><h2>Explore MPOTA</h2><p className="muted">Only approved municipal parks appear on the public map.</p><div className="park-list approved-reference-list">{visibleParks.map((park) => <button className="park-row" key={park.id} onClick={() => openPark(park)}><span className="reference">{park.reference}</span><span>{park.name}</span><small>{park.countryIso2} · {park.locality || park.region || 'Municipal park'}</small></button>)}</div></aside> : <aside className="panel form-panel"><p className="eyebrow">Community contribution</p><h2>{t.propose}</h2>{token ? <form onSubmit={submitProposal}><div className="coordinate-grid"><label>Latitude<input value={point.latitude.toFixed(6)} readOnly /></label><label>Longitude<input value={point.longitude.toFixed(6)} readOnly /></label></div><label>Country<input value={locationFields.countryName} placeholder="Select a point on the map" readOnly /></label><label>Country code<input name="countryIso2" required minLength={2} maxLength={2} placeholder="ES" value={locationFields.countryIso2} onChange={(event) => updateLocationField('countryIso2', event.target.value.toUpperCase())} /></label><label>Continent code<input name="continentCode" required placeholder="EU" value={locationFields.continentCode} onChange={(event) => updateLocationField('continentCode', event.target.value.toUpperCase())} /></label><label>Region<input name="region" value={locationFields.region} onChange={(event) => updateLocationField('region', event.target.value)} /></label><label>Locality<input name="locality" value={locationFields.locality} onChange={(event) => updateLocationField('locality', event.target.value)} /></label>{isResolvingLocation && <p className="map-hint">Looking up the selected location…</p>}<label>Park name<input name="name" required placeholder="Municipal park name" /></label><label>Type<select name="parkType"><option value="MUNICIPAL_PARK">Municipal park</option><option value="URBAN_FOREST">Urban forest</option><option value="BOTANICAL_GARDEN">Botanical garden</option></select></label><label>Description<textarea name="description" rows={3} /></label><label>Source URL <span className="optional">(optional)</span><input name="sourceUrl" type="url" placeholder="https://..." /></label><label>Access notes<textarea name="accessNotes" rows={3} /></label><button className="button full" type="submit">{t.submit}</button></form> : <div className="login-callout"><p>{t.loginRequired}</p><button className="button" onClick={() => setAuthMode('login')}>{t.signIn}</button></div>}</aside>}</section>}
      {tab === 'qso' && <ManualQsoPage parks={parks} token={token} t={t} onSignIn={() => setAuthMode('login')} onMessage={setMessage} />}
      {tab === 'uploads' && <section className="single-panel panel"><p className="eyebrow">Activator tools</p><h2>{t.uploads}</h2>{token ? <div className="log-tools-grid">
        <form className="upload-box" onSubmit={uploadAdif}><div className="upload-icon">↥</div><h3>Upload an ADIF log</h3><p className="muted">Choose the approved MPOTA park where this activity took place. Processing runs through the QSO validation API.</p><label>Park<select name="parkReference" required defaultValue=""><option value="" disabled>Select an approved park</option>{parks.map((park) => <option value={park.reference} key={park.id}>{park.reference} · {park.name}</option>)}</select></label><input name="file" type="file" accept=".adi,.adif" required /><button className="button" type="submit">{t.upload}</button></form>
        <div className="upload-history"><div className="section-heading"><div><p className="eyebrow">Processing history</p><h3>Your ADIF uploads</h3></div><span className="badge">{uploads.length}</span></div>{uploads.length ? <div className="upload-list">{uploads.map((upload) => <button className={`upload-row ${upload.errorCount ? 'has-errors' : ''}`} type="button" key={upload.id} onClick={() => showRejectedQsos(upload)} disabled={!upload.errorCount}><span className="upload-file"><strong>{upload.originalFilename}</strong><small>{upload.parkReference || 'Park unavailable'} · {upload.parkName || ''}</small></span><span className={`upload-status upload-status-${upload.status.toLowerCase()}`}>{upload.status}</span><span className="upload-meta"><small>{new Date(upload.uploadedAt).toLocaleString()}</small><small>{(upload.sizeBytes / 1024).toFixed(1)} KB</small><small>{upload.validCount} valid · {upload.errorCount} invalid</small></span></button>)}</div> : <p className="muted">No ADIF files uploaded yet.</p>}</div>
        {selectedUploadId && <div className="rejected-qso-panel"><div className="section-heading"><div><p className="eyebrow">Validation details</p><h3>Rejected QSOs</h3></div><button className="button ghost" type="button" onClick={() => { setSelectedUploadId(null); setRejectedQsos([]); }}>Close</button></div>{rejectedQsos.length ? <div className="activation-table-wrap"><table className="activation-table"><thead><tr><th>Hunter</th><th>UTC</th><th>Band</th><th>Mode</th><th>Reason</th></tr></thead><tbody>{rejectedQsos.map((qso) => <tr key={qso.id}><td className="callsign-cell">{qso.qsoCallsign}</td><td>{qso.qsoDatetime ? new Date(qso.qsoDatetime).toISOString() : qso.qsoDateUtc || '—'}</td><td>{qso.band || '—'}</td><td>{qso.mode || '—'}</td><td><strong>{qso.validity}</strong><br /><small>{qso.errorMessage || 'Rejected'}</small></td></tr>)}</tbody></table></div> : <p className="muted">No rejected QSOs were returned.</p>}</div>}
      </div> : <div className="login-callout"><p>{t.loginRequired}</p><button className="button" onClick={() => setAuthMode('login')}>{t.signIn}</button></div>}</section>}
      {tab === 'awards' && <section className="content-grid"><div className="panel"><p className="eyebrow">Collect and qualify</p><h2>{t.awards}</h2><div className="award-grid">{awards.length ? awards.map((award) => <article className="award-card" key={award.id}><div className="award-icon">✦</div><div><span className="badge">{award.type}</span><h3>{award.name}</h3><p className="muted">{award.description || 'A published MPOTA award.'}</p></div></article>) : <p className="muted">No published awards yet.</p>}</div></div>{canAward && <aside className="panel form-panel"><p className="eyebrow">Award Admin</p><h2>{t.saveAward}</h2><form onSubmit={submitAward}><label>Key<input name="key" required placeholder="municipal-starter" /></label><label>Name<input name="name" required placeholder="Municipal Starter" /></label><label>Description<textarea name="description" rows={3} /></label><label>Minimum entities<input name="minimumEntities" type="number" min="1" defaultValue="1" /></label><button className="button full">{t.saveAward}</button></form></aside>}</section>}
      {tab === 'admin' && canModerate && <ModerationPanel proposals={proposals} token={token} t={t} onRefresh={loadQueue} onMessage={setMessage} />}
      {tab === 'park-admin' && canModerate && <ParkAdminPanel token={token} canRemove={canManageUsers} onMessage={setMessage} />}
      {tab === 'users' && canManageUsers && <UsersPanel users={adminUsers} currentUserId={user?.id} token={token} t={t} onRefresh={loadUsers} onMessage={setMessage} />}
    </main>
    {duplicateWarning && <div className="modal-backdrop"><div className="modal duplicate-modal" role="alertdialog" aria-modal="true" aria-labelledby="duplicate-title"><button className="modal-close" onClick={() => setDuplicateWarning(null)} aria-label="Close">×</button><p className="eyebrow">Possible duplicate</p><h2 id="duplicate-title">Nearby MPOTA location</h2><p className="muted">An approved park or pending request is less than 150 metres from this point. Please check the entries before submitting.</p><div className="duplicate-list">{duplicateWarning.duplicates.map((duplicate) => <div className="duplicate-row" key={`${duplicate.kind}-${duplicate.id}`}><div><strong>{duplicate.reference || 'Pending request'}</strong><span>{duplicate.name}</span></div><small>{Number(duplicate.distance_meters).toFixed(1)} m away</small></div>)}</div><div className="row-actions"><button className="button ghost" onClick={() => setDuplicateWarning(null)}>Cancel</button><button className="button" onClick={async () => { try { await sendProposal(duplicateWarning.payload); setDuplicateWarning(null); } catch (error) { setMessage((error as Error).message); } }}>Submit anyway</button></div></div></div>}
    {authMode && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={() => setAuthMode(null)}>×</button><p className="eyebrow">MPOTA account</p><h2>{authMode === 'login' ? t.signIn : t.register}</h2><form onSubmit={submitAuth}><label>{t.email}<input name="email" type="email" required /></label><label>{t.password}<input name="password" type="password" minLength={8} required /></label>{authMode === 'register' && <><label>{t.name}<input name="displayName" required /></label><label>{t.callsign}<input name="callsign" /></label></>}<button className="button full">{authMode === 'login' ? t.signIn : t.register}</button></form><button className="link-button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? t.register : t.signIn}</button></div></div>}
    <footer><span>MPOTA · Municipal Parks on the Air</span><span>OpenStreetMap attribution and usage policy apply.</span></footer>
  </div>;
}
