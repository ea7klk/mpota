import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';

type Locale = 'en' | 'es' | 'fr' | 'de';
type User = { id: string; email: string; displayName: string; role: string; locale: Locale };
type Park = { id: string; reference: string; countryIso2: string; continentCode: string; region?: string; locality?: string; latitude: string; longitude: string; parkType: string; name: string; description?: string; sourceUrl?: string; accessNotes?: string; photoUrl?: string };
type Proposal = Park & { status: string; reviewNotes?: string };
type Award = { id: string; key: string; name: string; description?: string; type: string; status: string; version: number };

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
const TILE_URL = import.meta.env.VITE_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>';
const PARK_MARKER = L.icon({
  iconUrl: '/mpota-marker.svg',
  iconSize: [52, 52],
  iconAnchor: [26, 52],
  popupAnchor: [0, -48],
  className: 'mpota-marker-icon'
});

const copy: Record<Locale, Record<string, string>> = {
  en: { map: 'Map', propose: 'Propose a park', uploads: 'ADIF uploads', awards: 'Awards', admin: 'Moderation', signIn: 'Sign in', register: 'Register', signOut: 'Sign out', hero: 'Municipal parks on the air', heroText: 'Discover accessible places for amateur radio, propose a new park, and collect MPOTA awards.', approved: 'approved parks', choose: 'Choose a point on the map', submit: 'Submit proposal', email: 'Email', password: 'Password', name: 'Display name', callsign: 'Callsign', upload: 'Upload ADIF', loginRequired: 'Sign in to propose parks, upload logs, or manage MPOTA.', saveAward: 'Create award draft', publish: 'Publish', proposalQueue: 'Proposal queue' },
  es: { map: 'Mapa', propose: 'Proponer un parque', uploads: 'Cargas ADIF', awards: 'Premios', admin: 'Moderación', signIn: 'Iniciar sesión', register: 'Registrarse', signOut: 'Cerrar sesión', hero: 'Parques municipales en el aire', heroText: 'Descubre lugares accesibles para la radioafición, propone un parque y consigue premios MPOTA.', approved: 'parques aprobados', choose: 'Elige un punto en el mapa', submit: 'Enviar propuesta', email: 'Correo', password: 'Contraseña', name: 'Nombre visible', callsign: 'Indicativo', upload: 'Cargar ADIF', loginRequired: 'Inicia sesión para proponer parques, cargar logs o gestionar MPOTA.', saveAward: 'Crear borrador de premio', publish: 'Publicar', proposalQueue: 'Cola de propuestas' },
  fr: { map: 'Carte', propose: 'Proposer un parc', uploads: 'Importations ADIF', awards: 'Récompenses', admin: 'Modération', signIn: 'Connexion', register: "S'inscrire", signOut: 'Déconnexion', hero: 'Parcs municipaux sur les ondes', heroText: 'Découvrez des lieux accessibles pour la radio amateur, proposez un parc et obtenez des récompenses MPOTA.', approved: 'parcs approuvés', choose: 'Choisissez un point sur la carte', submit: 'Envoyer la proposition', email: 'E-mail', password: 'Mot de passe', name: 'Nom affiché', callsign: 'Indicatif', upload: 'Importer ADIF', loginRequired: 'Connectez-vous pour proposer des parcs, importer des logs ou gérer MPOTA.', saveAward: 'Créer un brouillon', publish: 'Publier', proposalQueue: 'File des propositions' },
  de: { map: 'Karte', propose: 'Park vorschlagen', uploads: 'ADIF-Uploads', awards: 'Auszeichnungen', admin: 'Moderation', signIn: 'Anmelden', register: 'Registrieren', signOut: 'Abmelden', hero: 'Kommunale Parks auf der Luft', heroText: 'Entdecke zugängliche Orte für den Amateurfunk, schlage Parks vor und sammle MPOTA-Auszeichnungen.', approved: 'genehmigte Parks', choose: 'Punkt auf der Karte wählen', submit: 'Vorschlag senden', email: 'E-Mail', password: 'Passwort', name: 'Anzeigename', callsign: 'Rufzeichen', upload: 'ADIF hochladen', loginRequired: 'Anmelden, um Parks vorzuschlagen, Logs hochzuladen oder MPOTA zu verwalten.', saveAward: 'Auszeichnungsentwurf erstellen', publish: 'Veröffentlichen', proposalQueue: 'Vorschlagswarteschlange' }
};

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? 'Request failed');
  return body as T;
}

function MapView({ parks, picking, onPick }: { parks: Park[]; picking: boolean; onPick: (lat: number, lon: number) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const pickingRef = useRef(picking);
  const onPickRef = useRef(onPick);
  useEffect(() => { pickingRef.current = picking; onPickRef.current = onPick; }, [picking, onPick]);
  useEffect(() => {
    if (!element.current || map.current) return;
    map.current = L.map(element.current).setView([40.4168, -3.7038], 3);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map.current);
    markers.current = L.layerGroup().addTo(map.current);
    map.current.on('click', (event) => { if (pickingRef.current) onPickRef.current(event.latlng.lat, event.latlng.lng); });
    return () => { map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!markers.current) return;
    markers.current.clearLayers();
    parks.forEach((park) => L.marker([Number(park.latitude), Number(park.longitude)], { icon: PARK_MARKER }).bindPopup(`<strong>${park.reference}</strong><br>${park.name}`).addTo(markers.current!));
  }, [parks]);
  return <div className={`map ${picking ? 'map-picking' : ''}`} ref={element} />;
}

export default function App() {
  const [locale, setLocale] = useState<Locale>((localStorage.getItem('mpota-locale') as Locale) || 'en');
  const [token, setToken] = useState(localStorage.getItem('mpota-token') || '');
  const [user, setUser] = useState<User | null>(null);
  const [parks, setParks] = useState<Park[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [tab, setTab] = useState('map');
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [point, setPoint] = useState({ latitude: 40.4168, longitude: -3.7038 });
  const [message, setMessage] = useState('');
  const t = copy[locale];

  const refresh = () => {
    request<Park[]>('/parks').then(setParks).catch(() => undefined);
    request<Award[]>('/awards').then(setAwards).catch(() => undefined);
    if (token) request<User>('/auth/me', {}, token).then(setUser).catch(() => { setToken(''); localStorage.removeItem('mpota-token'); });
  };
  useEffect(refresh, [token]);
  useEffect(() => { localStorage.setItem('mpota-locale', locale); }, [locale]);
  const canModerate = user && ['ENTITY_ADMIN', 'GLOBAL_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN'].includes(user.role);
  const canAward = user && ['AWARD_ADMIN', 'GLOBAL_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN'].includes(user.role);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      const result = await request<{ user: User; accessToken: string }>(authMode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      setToken(result.accessToken); localStorage.setItem('mpota-token', result.accessToken); setUser(result.user); setAuthMode(null); setMessage('');
    } catch (error) { setMessage((error as Error).message); }
  };

  const submitProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!token) return setAuthMode('login');
    const form = new FormData(event.currentTarget); const payload = Object.fromEntries(form);
    try { await request('/proposals', { method: 'POST', body: JSON.stringify({ ...payload, ...point, latitude: Number(point.latitude), longitude: Number(point.longitude) }) }, token); setProposalOpen(false); setMessage('Proposal submitted for approval.'); } catch (error) { setMessage((error as Error).message); }
  };

  const loadQueue = () => { if (token) request<Proposal[]>('/proposals/queue', {}, token).then(setProposals).catch((error) => setMessage(error.message)); };
  const decide = async (id: string, action: 'approve' | 'reject') => { await request(`/proposals/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) }, token); loadQueue(); refresh(); };
  const submitAward = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const value = Object.fromEntries(form); await request('/awards', { method: 'POST', body: JSON.stringify({ ...value, type: 'ACTIVATOR', allCountries: true, ruleDefinition: { minimumEntities: Number(value.minimumEntities || 1) } }) }, token); setMessage('Award draft created.'); refresh(); };
  const uploadAdif = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const input = (event.currentTarget.elements.namedItem('file') as HTMLInputElement); if (!input.files?.[0]) return; const body = new FormData(); body.append('file', input.files[0]); try { await request('/uploads/adif', { method: 'POST', body }, token); setMessage('ADIF uploaded and processed.'); } catch (error) { setMessage((error as Error).message); } };

  const nav = useMemo(() => [{ id: 'map', label: t.map }, { id: 'propose', label: t.propose }, { id: 'uploads', label: t.uploads }, { id: 'awards', label: t.awards }, ...(canModerate ? [{ id: 'admin', label: t.admin }] : [])], [t, canModerate]);
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">MP</span><span>MPOTA</span></div><nav>{nav.map((item) => <button className={tab === item.id ? 'nav-active' : ''} key={item.id} onClick={() => { setTab(item.id); if (item.id === 'admin') loadQueue(); }}>{item.label}</button>)}</nav><div className="header-actions"><select aria-label="Language" value={locale} onChange={(event) => setLocale(event.target.value as Locale)}><option value="en">EN</option><option value="es">ES</option><option value="fr">FR</option><option value="de">DE</option></select>{user ? <button className="user-pill" onClick={() => { setToken(''); setUser(null); localStorage.removeItem('mpota-token'); }}>{user.displayName} · {t.signOut}</button> : <><button className="button ghost" onClick={() => setAuthMode('login')}>{t.signIn}</button><button className="button" onClick={() => setAuthMode('register')}>{t.register}</button></>}</div></header>
    <main><section className="hero"><div><p className="eyebrow">Municipal Parks on the Air</p><h1>{t.hero}</h1><p className="hero-text">{t.heroText}</p><div className="hero-actions"><button className="button" onClick={() => { setTab('propose'); setProposalOpen(true); }}>{t.propose}</button><span className="stat"><strong>{parks.length}</strong> {t.approved}</span></div></div><div className="hero-card"><div className="signal">◎</div><div><strong>MPES-00001</strong><span>Ready for the community</span></div></div></section>
      {message && <div className="notice">{message}<button onClick={() => setMessage('')}>×</button></div>}
      {tab === 'map' && <section className="content-grid"><div className="panel map-panel"><div className="panel-heading"><div><p className="eyebrow">Live catalog</p><h2>{t.map}</h2></div><span className="badge">{parks.length} entities</span></div><MapView parks={parks} picking={false} onPick={() => undefined} /></div><aside className="panel side-panel"><p className="eyebrow">Approved references</p><h2>Explore MPOTA</h2><p className="muted">Only approved municipal parks appear on the public map.</p><div className="park-list">{parks.slice(0, 8).map((park) => <button className="park-row" key={park.id} onClick={() => setMessage(`${park.reference} · ${park.name}`)}><span className="reference">{park.reference}</span><span>{park.name}</span><small>{park.countryIso2} · {park.locality || park.region || 'Municipal park'}</small></button>)}</div></aside></section>}
      {tab === 'propose' && <section className="content-grid"><div className="panel map-panel"><div className="panel-heading"><div><p className="eyebrow">Location first</p><h2>{t.choose}</h2></div><span className="badge">{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</span></div><MapView parks={parks} picking onPick={(latitude, longitude) => setPoint({ latitude, longitude })} /></div><aside className="panel form-panel"><p className="eyebrow">Community contribution</p><h2>{t.propose}</h2>{token ? <form onSubmit={submitProposal}><label>Country code<input name="countryIso2" required minLength={2} maxLength={2} placeholder="ES" /></label><label>Continent code<input name="continentCode" required placeholder="EU" /></label><label>Region<input name="region" /></label><label>Locality<input name="locality" /></label><label>Park name<input name="name" required placeholder="Municipal park name" /></label><label>Type<select name="parkType"><option value="MUNICIPAL_PARK">Municipal park</option><option value="URBAN_FOREST">Urban forest</option><option value="BOTANICAL_GARDEN">Botanical garden</option></select></label><label>Description<textarea name="description" rows={3} /></label><label>Source URL<input name="sourceUrl" type="url" placeholder="https://..." /></label><label>Access notes<textarea name="accessNotes" rows={3} /></label><button className="button full" type="submit">{t.submit}</button></form> : <div className="login-callout"><p>{t.loginRequired}</p><button className="button" onClick={() => setAuthMode('login')}>{t.signIn}</button></div>}</aside></section>}
      {tab === 'uploads' && <section className="single-panel panel"><p className="eyebrow">Activator tools</p><h2>{t.uploads}</h2>{token ? <form className="upload-box" onSubmit={uploadAdif}><div className="upload-icon">↥</div><h3>Upload an ADIF log</h3><p className="muted">The upload is stored privately, checked, parsed, and validated against approved MPOTA references.</p><input name="file" type="file" accept=".adi,.adif" required /><button className="button" type="submit">{t.upload}</button></form> : <div className="login-callout"><p>{t.loginRequired}</p><button className="button" onClick={() => setAuthMode('login')}>{t.signIn}</button></div>}</section>}
      {tab === 'awards' && <section className="content-grid"><div className="panel"><p className="eyebrow">Collect and qualify</p><h2>{t.awards}</h2><div className="award-grid">{awards.length ? awards.map((award) => <article className="award-card" key={award.id}><div className="award-icon">✦</div><div><span className="badge">{award.type}</span><h3>{award.name}</h3><p className="muted">{award.description || 'A published MPOTA award.'}</p></div></article>) : <p className="muted">No published awards yet.</p>}</div></div>{canAward && <aside className="panel form-panel"><p className="eyebrow">Award Admin</p><h2>{t.saveAward}</h2><form onSubmit={submitAward}><label>Key<input name="key" required placeholder="municipal-starter" /></label><label>Name<input name="name" required placeholder="Municipal Starter" /></label><label>Description<textarea name="description" rows={3} /></label><label>Minimum entities<input name="minimumEntities" type="number" min="1" defaultValue="1" /></label><button className="button full">{t.saveAward}</button></form></aside>}</section>}
      {tab === 'admin' && canModerate && <section className="single-panel panel"><div className="panel-heading"><div><p className="eyebrow">Scoped moderation</p><h2>{t.proposalQueue}</h2></div><button className="button ghost" onClick={loadQueue}>Refresh</button></div><div className="queue">{proposals.length ? proposals.map((proposal) => <article className="queue-row" key={proposal.id}><div><span className="badge">{proposal.countryIso2} · {proposal.continentCode}</span><h3>{proposal.name}</h3><p className="muted">{proposal.locality || proposal.region || 'Location not specified'} · {Number(proposal.latitude).toFixed(5)}, {Number(proposal.longitude).toFixed(5)}</p></div><div className="row-actions"><button className="button" onClick={() => decide(proposal.id, 'approve')}>Approve</button><button className="button danger" onClick={() => decide(proposal.id, 'reject')}>Reject</button></div></article>) : <p className="muted">No pending proposals in your scope.</p>}</div></section>}
    </main>
    {authMode && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={() => setAuthMode(null)}>×</button><p className="eyebrow">MPOTA account</p><h2>{authMode === 'login' ? t.signIn : t.register}</h2><form onSubmit={submitAuth}><label>{t.email}<input name="email" type="email" required /></label><label>{t.password}<input name="password" type="password" minLength={8} required /></label>{authMode === 'register' && <><label>{t.name}<input name="displayName" required /></label><label>{t.callsign}<input name="callsign" /></label></>}<button className="button full">{authMode === 'login' ? t.signIn : t.register}</button></form><button className="link-button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? t.register : t.signIn}</button></div></div>}
    {proposalOpen && tab === 'propose' && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={() => setProposalOpen(false)}>×</button><p className="eyebrow">{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</p><h2>{t.propose}</h2><p className="muted">Select a point on the map and use the full proposal form beside it.</p><button className="button full" onClick={() => setProposalOpen(false)}>Continue</button></div></div>}
    <footer><span>MPOTA · Municipal Parks on the Air</span><span>OpenStreetMap attribution and usage policy apply.</span></footer>
  </div>;
}
