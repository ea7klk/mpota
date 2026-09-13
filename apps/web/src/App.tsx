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
type Park = { id: string; reference: string; countryIso2: string; continentCode: string; region?: string; locality?: string; latitude: string; longitude: string; parkType: string; name: string; description?: string; sourceUrl?: string; accessNotes?: string; photoUrl?: string };
type Proposal = Park & { status: string; reviewNotes?: string };
type Award = { id: string; key: string; name: string; description?: string; type: string; status: string; version: number };
type Duplicate = { kind: 'APPROVED_PARK' | 'PENDING_PROPOSAL'; id: string; reference?: string; name: string; distance_meters: number };

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
const TILE_URL = import.meta.env.VITE_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>';
const COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const CONTINENT_CODES = ['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA'];
const ROLE_OPTIONS: Role[] = ['MEMBER', 'ENTITY_ADMIN', 'AWARD_ADMIN', 'GLOBAL_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN'];

const PARK_MARKER = L.icon({ iconUrl: '/mpota-marker.svg', iconSize: [42, 42], iconAnchor: [21, 42], popupAnchor: [0, -38], className: 'mpota-marker-icon' });
const PROPOSAL_MARKER = L.divIcon({ className: 'proposal-marker', html: '<span><b>+</b></span>', iconSize: [34, 42], iconAnchor: [17, 42], popupAnchor: [0, -38] });

const copy: Record<Locale, Record<string, string>> = {
  en: { map: 'Map', propose: 'Propose a park', uploads: 'ADIF uploads', awards: 'Awards', admin: 'Moderation', users: 'Users', signIn: 'Sign in', register: 'Register', signOut: 'Sign out', hero: 'Municipal parks on the air', heroText: 'Discover accessible places for amateur radio, propose a new park, and collect MPOTA awards.', approved: 'approved parks', choose: 'Choose a point on the map', submit: 'Submit proposal', email: 'Email', password: 'Password', name: 'Display name', callsign: 'Callsign', upload: 'Upload ADIF', loginRequired: 'Sign in to propose parks, upload logs, or manage MPOTA.', saveAward: 'Create award draft', proposalQueue: 'Proposal queue', approvedParks: 'Approved parks', remove: 'Remove', reviewNotes: 'Review notes', coordinates: 'Coordinates', pickLocation: 'Click the map to place the proposal marker.', access: 'Approval access', allCountries: 'All countries', countryScope: 'Countries', continentScope: 'Continents', saveAccess: 'Save access', deactivate: 'Deactivate', delete: 'Delete', noUsers: 'No users found', status: 'Status', role: 'Role' },
  es: { map: 'Mapa', propose: 'Proponer un parque', uploads: 'Cargas ADIF', awards: 'Premios', admin: 'Moderación', users: 'Usuarios', signIn: 'Iniciar sesión', register: 'Registrarse', signOut: 'Cerrar sesión', hero: 'Parques municipales en el aire', heroText: 'Descubre lugares accesibles para la radioafición, propone un parque y consigue premios MPOTA.', approved: 'parques aprobados', choose: 'Elige un punto en el mapa', submit: 'Enviar propuesta', email: 'Correo', password: 'Contraseña', name: 'Nombre visible', callsign: 'Indicativo', upload: 'Cargar ADIF', loginRequired: 'Inicia sesión para proponer parques, cargar logs o gestionar MPOTA.', saveAward: 'Crear borrador de premio', proposalQueue: 'Cola de propuestas', approvedParks: 'Parques aprobados', remove: 'Retirar', reviewNotes: 'Notas de revisión', coordinates: 'Coordenadas', pickLocation: 'Haz clic en el mapa para colocar el marcador.', access: 'Acceso de aprobación', allCountries: 'Todos los países', countryScope: 'Países', continentScope: 'Continentes', saveAccess: 'Guardar acceso', deactivate: 'Desactivar', delete: 'Eliminar', noUsers: 'No se encontraron usuarios', status: 'Estado', role: 'Rol' },
  fr: { map: 'Carte', propose: 'Proposer un parc', uploads: 'Importations ADIF', awards: 'Récompenses', admin: 'Modération', users: 'Utilisateurs', signIn: 'Connexion', register: "S'inscrire", signOut: 'Déconnexion', hero: 'Parcs municipaux sur les ondes', heroText: 'Découvrez des lieux accessibles pour la radio amateur, proposez un parc et obtenez des récompenses MPOTA.', approved: 'parcs approuvés', choose: 'Choisissez un point sur la carte', submit: 'Envoyer la proposition', email: 'E-mail', password: 'Mot de passe', name: 'Nom affiché', callsign: 'Indicatif', upload: 'Importer ADIF', loginRequired: 'Connectez-vous pour proposer des parcs, importer des logs ou gérer MPOTA.', saveAward: 'Créer un brouillon', proposalQueue: 'File des propositions', approvedParks: 'Parcs approuvés', remove: 'Retirer', reviewNotes: 'Notes de révision', coordinates: 'Coordonnées', pickLocation: 'Cliquez sur la carte pour placer le marqueur.', access: 'Accès d’approbation', allCountries: 'Tous les pays', countryScope: 'Pays', continentScope: 'Continents', saveAccess: 'Enregistrer l’accès', deactivate: 'Désactiver', delete: 'Supprimer', noUsers: 'Aucun utilisateur', status: 'Statut', role: 'Rôle' },
  de: { map: 'Karte', propose: 'Park vorschlagen', uploads: 'ADIF-Uploads', awards: 'Auszeichnungen', admin: 'Moderation', users: 'Benutzer', signIn: 'Anmelden', register: 'Registrieren', signOut: 'Abmelden', hero: 'Kommunale Parks auf der Luft', heroText: 'Entdecke zugängliche Orte für den Amateurfunk, schlage Parks vor und sammle MPOTA-Auszeichnungen.', approved: 'genehmigte Parks', choose: 'Punkt auf der Karte wählen', submit: 'Vorschlag senden', email: 'E-Mail', password: 'Passwort', name: 'Anzeigename', callsign: 'Rufzeichen', upload: 'ADIF hochladen', loginRequired: 'Anmelden, um Parks vorzuschlagen, Logs hochzuladen oder MPOTA zu verwalten.', saveAward: 'Auszeichnungsentwurf erstellen', proposalQueue: 'Vorschlagswarteschlange', approvedParks: 'Genehmigte Parks', remove: 'Entfernen', reviewNotes: 'Prüfnotizen', coordinates: 'Koordinaten', pickLocation: 'Klicke auf die Karte, um den Marker zu platzieren.', access: 'Genehmigungszugriff', allCountries: 'Alle Länder', countryScope: 'Länder', continentScope: 'Kontinente', saveAccess: 'Zugriff speichern', deactivate: 'Deaktivieren', delete: 'Löschen', noUsers: 'Keine Benutzer gefunden', status: 'Status', role: 'Rolle' }
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

function ModerationPanel({ proposals, parks, canRemove, token, t, onRefresh, onMessage }: { proposals: Proposal[]; parks: Park[]; canRemove: boolean; token: string; t: Record<string, string>; onRefresh: () => void; onMessage: (message: string) => void }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const decide = async (proposal: Proposal, action: 'approve' | 'reject') => {
    try {
      await request(`/proposals/${proposal.id}/${action}`, { method: 'POST', body: JSON.stringify({ notes: notes[proposal.id] || undefined }) }, token);
      onMessage(action === 'approve' ? `${proposal.name} approved.` : `${proposal.name} rejected.`);
      onRefresh();
    } catch (error) { onMessage((error as Error).message); }
  };
  const removePark = async (park: Park) => {
    const reason = window.prompt(`Reason for removing ${park.reference}:`, 'Removed by global administrator');
    if (reason === null) return;
    try { await request(`/parks/${park.id}/remove`, { method: 'POST', body: JSON.stringify({ notes: reason }) }, token); onMessage(`${park.reference} removed.`); onRefresh(); } catch (error) { onMessage((error as Error).message); }
  };
  return <section className="admin-sections">
    <div className="panel"><div className="panel-heading"><div><p className="eyebrow">Scoped moderation</p><h2>{t.proposalQueue}</h2></div><button className="button ghost" onClick={onRefresh}>Refresh</button></div><div className="queue">{proposals.length ? proposals.map((proposal) => <article className="queue-row" key={proposal.id}><div className="queue-content"><span className="badge">{proposal.countryIso2} · {proposal.continentCode}</span><h3>{proposal.name}</h3><p className="muted">{proposal.locality || proposal.region || 'Location not specified'} · {Number(proposal.latitude).toFixed(5)}, {Number(proposal.longitude).toFixed(5)}</p><textarea aria-label={t.reviewNotes} rows={2} placeholder={t.reviewNotes} value={notes[proposal.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [proposal.id]: event.target.value }))} /></div><div className="row-actions"><button className="button" onClick={() => decide(proposal, 'approve')}>Approve</button><button className="button danger" onClick={() => decide(proposal, 'reject')}>Reject</button></div></article>) : <p className="muted">No pending proposals in your approval scope.</p>}</div></div>
    {canRemove && <div className="panel"><div className="panel-heading"><div><p className="eyebrow">Global administration</p><h2>{t.approvedParks}</h2></div><span className="badge">{parks.length}</span></div><div className="queue">{parks.map((park) => <article className="queue-row" key={park.id}><div><span className="reference">{park.reference}</span><h3>{park.name}</h3><p className="muted">{park.countryIso2} · {park.locality || park.region || 'Municipal park'}</p></div><button className="button danger" onClick={() => removePark(park)}>{t.remove}</button></article>)}</div></div>}
  </section>;
}

function UsersPanel({ users, currentUserId, token, t, onRefresh, onMessage }: { users: AdminUser[]; currentUserId?: string; token: string; t: Record<string, string>; onRefresh: () => void; onMessage: (message: string) => void }) {
  const [drafts, setDrafts] = useState<Record<string, ApprovalScope & { role: Role }>>({});
  useEffect(() => { setDrafts(Object.fromEntries(users.map((user) => [user.id, { role: user.role, countryCodes: user.approvalScope?.countryCodes ?? [], continentCodes: user.approvalScope?.continentCodes ?? [], allCountries: user.approvalScope?.allCountries ?? false }]))); }, [users]);
  const updateDraft = (id: string, patch: Partial<ApprovalScope & { role: Role }>) => setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const saveAccess = async (user: AdminUser) => { try { await request(`/admin/users/${user.id}/access`, { method: 'PATCH', body: JSON.stringify(drafts[user.id]) }, token); onMessage(`${user.email} access updated.`); onRefresh(); } catch (error) { onMessage((error as Error).message); } };
  const changeStatus = async (user: AdminUser, action: 'deactivate' | 'delete') => { if (!window.confirm(`${action === 'delete' ? 'Delete' : 'Deactivate'} ${user.email}?`)) return; try { await request(`/admin/users/${user.id}${action === 'delete' ? '' : '/deactivate'}`, { method: action === 'delete' ? 'DELETE' : 'POST' }, token); onMessage(`${user.email} ${action}d.`); onRefresh(); } catch (error) { onMessage((error as Error).message); } };
  return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Global administration</p><h2>{t.users}</h2></div><button className="button ghost" onClick={onRefresh}>Refresh</button></div><div className="user-list">{users.length ? users.map((user) => { const draft = drafts[user.id] ?? { role: user.role, countryCodes: [], continentCodes: [], allCountries: false }; const self = user.id === currentUserId; return <article className="user-admin-row" key={user.id}><div className="user-summary"><span className="badge">{user.status}</span><h3>{user.displayName} {user.callsign && <small>· {user.callsign}</small>}</h3><p className="muted">{user.email}</p></div><div className="user-access"><label>{t.role}<select value={draft.role} onChange={(event) => updateDraft(user.id, { role: event.target.value as Role })}>{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><label className="checkbox-row"><input type="checkbox" checked={draft.allCountries} onChange={(event) => updateDraft(user.id, { allCountries: event.target.checked })} /> {t.allCountries}</label><label>{t.countryScope}<select multiple size={5} disabled={draft.allCountries} value={draft.countryCodes} onChange={(event) => updateDraft(user.id, { countryCodes: Array.from(event.target.selectedOptions, (option) => option.value) })}>{COUNTRY_CODES.map((code) => <option key={code} value={code}>{code}</option>)}</select></label><label>{t.continentScope}<select multiple size={4} disabled={draft.allCountries} value={draft.continentCodes} onChange={(event) => updateDraft(user.id, { continentCodes: Array.from(event.target.selectedOptions, (option) => option.value) })}>{CONTINENT_CODES.map((code) => <option key={code} value={code}>{code}</option>)}</select></label><div className="row-actions"><button className="button" onClick={() => saveAccess(user)}>{t.saveAccess}</button><button className="button ghost" disabled={self || user.status !== 'ACTIVE'} onClick={() => changeStatus(user, 'deactivate')}>{t.deactivate}</button><button className="button danger" disabled={self || user.status === 'DELETED'} onClick={() => changeStatus(user, 'delete')}>{t.delete}</button></div></div></article>; }) : <p className="muted">{t.noUsers}</p>}</div></section>;
}

export default function App() {
  const [locale, setLocale] = useState<Locale>((localStorage.getItem('mpota-locale') as Locale) || 'en');
  const [token, setToken] = useState(localStorage.getItem('mpota-token') || '');
  const [user, setUser] = useState<User | null>(null);
  const [parks, setParks] = useState<Park[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [tab, setTab] = useState('map');
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ duplicates: Duplicate[]; payload: Record<string, FormDataEntryValue> } | null>(null);
  const [point, setPoint] = useState<Coordinates>({ latitude: 40.4168, longitude: -3.7038 });
  const [mapView, setMapView] = useState<MapViewState>({ latitude: 40.4168, longitude: -3.7038, zoom: 3 });
  const [locationFields, setLocationFields] = useState<LocationFields>({ countryName: '', countryIso2: '', continentCode: '', region: '', locality: '' });
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [selectedPark, setSelectedPark] = useState<Park | null>(null);
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
  const uploadAdif = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem('file') as HTMLInputElement; if (!input.files?.[0]) return; const body = new FormData(); body.append('file', input.files[0]); try { await request('/uploads/adif', { method: 'POST', body }, token); setMessage('ADIF uploaded and processed.'); } catch (error) { setMessage((error as Error).message); } };

  const nav = useMemo(() => [{ id: 'map', label: t.map }, { id: 'propose', label: t.propose }, { id: 'uploads', label: t.uploads }, { id: 'awards', label: t.awards }, ...(canModerate ? [{ id: 'admin', label: t.admin }] : []), ...(canManageUsers ? [{ id: 'users', label: t.users }] : [])], [t, canModerate, canManageUsers]);
  const selectTab = (id: string) => { setTab(id); if (id === 'admin') loadQueue(); if (id === 'users') loadUsers(); };

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><img className="header-banner" src="/mpota-logo-banner.svg" alt="MPOTA — Municipal Parks On The Air" /></div><nav>{nav.map((item) => <button className={tab === item.id ? 'nav-active' : ''} key={item.id} onClick={() => selectTab(item.id)}>{item.label}</button>)}</nav><div className="header-actions"><select aria-label="Language" value={locale} onChange={(event) => setLocale(event.target.value as Locale)}><option value="en">EN</option><option value="es">ES</option><option value="fr">FR</option><option value="de">DE</option></select>{user ? <button className="user-pill" onClick={() => { setToken(''); setUser(null); localStorage.removeItem('mpota-token'); }}>{user.displayName} · {t.signOut}</button> : <><button className="button ghost" onClick={() => setAuthMode('login')}>{t.signIn}</button><button className="button" onClick={() => setAuthMode('register')}>{t.register}</button></>}</div></header>
    <main><section className="hero"><div className="hero-copy"><p className="eyebrow">Municipal Parks on the Air</p><h1>{t.hero}</h1><p className="hero-text">{t.heroText}</p><div className="hero-actions"><button className="button" onClick={() => setTab('propose')}>{t.propose}</button><span className="stat"><strong>{parks.length}</strong> {t.approved}</span></div></div><div className="hero-card"><div className="signal">◎</div><div><strong>MPES-00001</strong><span>Ready for the community</span></div></div></section>
      {message && <div className="notice">{message}<button onClick={() => setMessage('')}>×</button></div>}
      {(tab === 'map' || tab === 'propose') && <section className="content-grid"><div className="panel map-panel"><div className="panel-heading"><div>{tab === 'map' ? <><p className="eyebrow">Live catalog</p><h2>{t.map}</h2></> : <><p className="eyebrow">Location first</p><h2>{t.choose}</h2><p className="map-hint">{t.pickLocation}</p></>}</div><span className="badge">{tab === 'map' ? `${parks.length} entities` : `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`}</span></div><MapView parks={parks} picking={tab === 'propose'} selectedPoint={tab === 'propose' ? point : undefined} view={mapView} onViewChange={setMapView} onParkSelect={setSelectedPark} onVisibleParksChange={setVisibleParks} onPick={tab === 'propose' ? handleMapPick : () => undefined} /></div>{tab === 'map' ? <aside className="panel side-panel"><p className="eyebrow">Approved references</p><h2>Explore MPOTA</h2><p className="muted">Only approved municipal parks appear on the public map.</p><div className="park-list approved-reference-list">{visibleParks.map((park) => <button className="park-row" key={park.id} onClick={() => setMessage(`${park.reference} · ${park.name}`)}><span className="reference">{park.reference}</span><span>{park.name}</span><small>{park.countryIso2} · {park.locality || park.region || 'Municipal park'}</small></button>)}</div></aside> : <aside className="panel form-panel"><p className="eyebrow">Community contribution</p><h2>{t.propose}</h2>{token ? <form onSubmit={submitProposal}><div className="coordinate-grid"><label>Latitude<input value={point.latitude.toFixed(6)} readOnly /></label><label>Longitude<input value={point.longitude.toFixed(6)} readOnly /></label></div><label>Country<input value={locationFields.countryName} placeholder="Select a point on the map" readOnly /></label><label>Country code<input name="countryIso2" required minLength={2} maxLength={2} placeholder="ES" value={locationFields.countryIso2} onChange={(event) => updateLocationField('countryIso2', event.target.value.toUpperCase())} /></label><label>Continent code<input name="continentCode" required placeholder="EU" value={locationFields.continentCode} onChange={(event) => updateLocationField('continentCode', event.target.value.toUpperCase())} /></label><label>Region<input name="region" value={locationFields.region} onChange={(event) => updateLocationField('region', event.target.value)} /></label><label>Locality<input name="locality" value={locationFields.locality} onChange={(event) => updateLocationField('locality', event.target.value)} /></label>{isResolvingLocation && <p className="map-hint">Looking up the selected location…</p>}<label>Park name<input name="name" required placeholder="Municipal park name" /></label><label>Type<select name="parkType"><option value="MUNICIPAL_PARK">Municipal park</option><option value="URBAN_FOREST">Urban forest</option><option value="BOTANICAL_GARDEN">Botanical garden</option></select></label><label>Description<textarea name="description" rows={3} /></label><label>Source URL <span className="optional">(optional)</span><input name="sourceUrl" type="url" placeholder="https://..." /></label><label>Access notes<textarea name="accessNotes" rows={3} /></label><button className="button full" type="submit">{t.submit}</button></form> : <div className="login-callout"><p>{t.loginRequired}</p><button className="button" onClick={() => setAuthMode('login')}>{t.signIn}</button></div>}</aside>}</section>}
      {tab === 'uploads' && <section className="single-panel panel"><p className="eyebrow">Activator tools</p><h2>{t.uploads}</h2>{token ? <form className="upload-box" onSubmit={uploadAdif}><div className="upload-icon">↥</div><h3>Upload an ADIF log</h3><p className="muted">The upload is stored privately, checked, parsed, and validated against approved MPOTA references.</p><input name="file" type="file" accept=".adi,.adif" required /><button className="button" type="submit">{t.upload}</button></form> : <div className="login-callout"><p>{t.loginRequired}</p><button className="button" onClick={() => setAuthMode('login')}>{t.signIn}</button></div>}</section>}
      {tab === 'awards' && <section className="content-grid"><div className="panel"><p className="eyebrow">Collect and qualify</p><h2>{t.awards}</h2><div className="award-grid">{awards.length ? awards.map((award) => <article className="award-card" key={award.id}><div className="award-icon">✦</div><div><span className="badge">{award.type}</span><h3>{award.name}</h3><p className="muted">{award.description || 'A published MPOTA award.'}</p></div></article>) : <p className="muted">No published awards yet.</p>}</div></div>{canAward && <aside className="panel form-panel"><p className="eyebrow">Award Admin</p><h2>{t.saveAward}</h2><form onSubmit={submitAward}><label>Key<input name="key" required placeholder="municipal-starter" /></label><label>Name<input name="name" required placeholder="Municipal Starter" /></label><label>Description<textarea name="description" rows={3} /></label><label>Minimum entities<input name="minimumEntities" type="number" min="1" defaultValue="1" /></label><button className="button full">{t.saveAward}</button></form></aside>}</section>}
      {tab === 'admin' && canModerate && <ModerationPanel proposals={proposals} parks={parks} canRemove={canManageUsers} token={token} t={t} onRefresh={() => { loadQueue(); refresh(); }} onMessage={setMessage} />}
      {tab === 'users' && canManageUsers && <UsersPanel users={adminUsers} currentUserId={user?.id} token={token} t={t} onRefresh={loadUsers} onMessage={setMessage} />}
    </main>
    {selectedPark && <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setSelectedPark(null); }}><div className="modal park-details-modal" role="dialog" aria-modal="true" aria-labelledby="park-details-title"><button className="modal-close" onClick={() => setSelectedPark(null)} aria-label="Close">×</button><p className="eyebrow">MPOTA reference</p><span className="reference">{selectedPark.reference}</span><h2 id="park-details-title">{selectedPark.name}</h2><dl className="park-details-grid"><div><dt>Country</dt><dd>{selectedPark.countryIso2}</dd></div><div><dt>Continent</dt><dd>{selectedPark.continentCode}</dd></div><div><dt>Region</dt><dd>{selectedPark.region || '—'}</dd></div><div><dt>Locality</dt><dd>{selectedPark.locality || '—'}</dd></div><div><dt>Type</dt><dd>{selectedPark.parkType.replaceAll('_', ' ')}</dd></div><div><dt>Coordinates</dt><dd>{Number(selectedPark.latitude).toFixed(6)}, {Number(selectedPark.longitude).toFixed(6)}</dd></div></dl>{selectedPark.description && <section><h3>Description</h3><p className="muted details-copy">{selectedPark.description}</p></section>}{selectedPark.accessNotes && <section><h3>Access notes</h3><p className="muted details-copy">{selectedPark.accessNotes}</p></section>}{selectedPark.photoUrl && <p><a className="detail-link" href={selectedPark.photoUrl} target="_blank" rel="noopener noreferrer">Open photo in a new window ↗</a></p>}{selectedPark.sourceUrl && <p><a className="detail-link" href={selectedPark.sourceUrl} target="_blank" rel="noopener noreferrer">Open source URL in a new window ↗</a></p>}</div></div>}
    {duplicateWarning && <div className="modal-backdrop"><div className="modal duplicate-modal" role="alertdialog" aria-modal="true" aria-labelledby="duplicate-title"><button className="modal-close" onClick={() => setDuplicateWarning(null)} aria-label="Close">×</button><p className="eyebrow">Possible duplicate</p><h2 id="duplicate-title">Nearby MPOTA location</h2><p className="muted">An approved park or pending request is less than 150 metres from this point. Please check the entries before submitting.</p><div className="duplicate-list">{duplicateWarning.duplicates.map((duplicate) => <div className="duplicate-row" key={`${duplicate.kind}-${duplicate.id}`}><div><strong>{duplicate.reference || 'Pending request'}</strong><span>{duplicate.name}</span></div><small>{Number(duplicate.distance_meters).toFixed(1)} m away</small></div>)}</div><div className="row-actions"><button className="button ghost" onClick={() => setDuplicateWarning(null)}>Cancel</button><button className="button" onClick={async () => { try { await sendProposal(duplicateWarning.payload); setDuplicateWarning(null); } catch (error) { setMessage((error as Error).message); } }}>Submit anyway</button></div></div></div>}
    {authMode && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={() => setAuthMode(null)}>×</button><p className="eyebrow">MPOTA account</p><h2>{authMode === 'login' ? t.signIn : t.register}</h2><form onSubmit={submitAuth}><label>{t.email}<input name="email" type="email" required /></label><label>{t.password}<input name="password" type="password" minLength={8} required /></label>{authMode === 'register' && <><label>{t.name}<input name="displayName" required /></label><label>{t.callsign}<input name="callsign" /></label></>}<button className="button full">{authMode === 'login' ? t.signIn : t.register}</button></form><button className="link-button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? t.register : t.signIn}</button></div></div>}
    <footer><span>MPOTA · Municipal Parks on the Air</span><span>OpenStreetMap attribution and usage policy apply.</span></footer>
  </div>;
}
