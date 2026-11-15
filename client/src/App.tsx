import { Toasts } from './components/ui';
import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { useGame } from './lib/store';
import { connectSocket } from './lib/socket';
import { AuthScreen } from './screens/AuthScreen';
import { CharacterCreator } from './screens/CharacterCreator';
import { Memorial } from './screens/Memorial';
import { GameScreen } from './game/GameScreen';
import { MobileGame } from './game/MobileGame';
import { useIsMobile } from './lib/mobile';
import { AdminPanel } from './admin/AdminPanel';
import { LobbyScreen, RejectedNotice, StaffHome, WaitingScreen, type Me } from './screens/GateScreens';
import { PrologueScreen } from './game/prologue/PrologueScreen';
import { ChronicleModal } from './game/prologue/Chronicle';

const STAFF_PLAY_KEY = 'rc_staff_play';

function useHash() {
  const [h, setH] = useState(location.hash);
  useEffect(() => { const f = () => setH(location.hash); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return h;
}

export default function App() {
  const { user, characterId, set, toasts, self } = useGame();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  // Equipe escolhe na entrada entre o painel e jogar; a escolha vale até fechar a aba.
  const [staffPlay, setStaffPlay] = useState(() => { try { return sessionStorage.getItem(STAFF_PLAY_KEY) === '1'; } catch { return false; } });
  const [rejectionSeen, setRejectionSeen] = useState(false);
  const hash = useHash();
  const mobile = useIsMobile();
  const boot = async () => {
    setLoading(true);
    try {
      const [m, content] = await Promise.all([api<Me>('/auth/me'), api('/content')]);
      setMe(m);
      set({ user: m.user as any, characterId: m.characterId, content });
      // Só conecta ao jogo quando dá para jogar (não pausado, condado aberto, ficha aprovada).
      if (m.user && m.characterId && !m.block) connectSocket();
    } finally { setLoading(false); }
  };
  useEffect(() => { boot(); }, []);
  if (hash.startsWith('#/memorial')) return <Memorial />;
  if (loading) return <div className="h-full flex items-center justify-center label">Carregando Raven Creek…</div>;
  if (!user) return <AuthScreen onDone={boot} />;
  if (hash.startsWith('#/admin')) return <><AdminPanel /><AdminToasts toasts={toasts} /></>;
  const staff = !!user.role && user.role !== 'player';
  if (staff && !staffPlay && me) return <StaffHome me={me} onPlay={() => { try { sessionStorage.setItem(STAFF_PLAY_KEY, '1'); } catch { /* ignora */ } setStaffPlay(true); }} />;
  if (!characterId && me?.rejection && !rejectionSeen) return <RejectedNotice rejection={me.rejection} onContinue={() => setRejectionSeen(true)} />;
  if (!characterId) return <CharacterCreator onDone={boot} />;
  if (me?.block?.reason === 'lobby') return <LobbyScreen me={me} />;
  if (me?.block) return <WaitingScreen me={me} />;
  return <>{self?.prologue ? <PrologueScreen /> : mobile ? <MobileGame /> : <GameScreen />}<ChronicleModal /></>;
}

function AdminToasts({ toasts }: { toasts: { id: number; text: string; level: string; icon?: string }[] }) {
  return <Toasts toasts={toasts} className="fixed bottom-6 right-6 z-50 !items-end" />;
}
