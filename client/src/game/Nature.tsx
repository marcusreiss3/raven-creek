import { useState } from 'react';
import { GameIcon } from '../components/GameIcon';
import { Hotspot } from './Scene';
import { useGame } from '../lib/store';
import { action } from '../lib/socket';
import { Bar, Modal, Section, Tip, fmtDuration } from '../components/ui';
import type { DogVariant, SceneDog } from '../lib/types';

export const SEASON_LABEL: Record<string, { name: string; hint: string }> = {
  spring: { name: 'Primavera', hint: 'Chuva frequente, plantações crescem bem, peixes ativos.' },
  summer: { name: 'Verão', hint: 'Calor: comida estraga rápido e a sede aperta. Melhor época para plantar.' },
  autumn: { name: 'Outono', hint: 'Noites frias, boa caça. Estoque comida e lenha.' },
  winter: { name: 'Inverno', hint: 'Frio intenso e neve. Plantações paradas, pouca pesca. Comida dura mais. Fogueira e roupas quentes salvam vidas.' },
};
export const TOOL_LABEL: Record<string, string> = { campfire: 'fogueira acesa', fire: 'isqueiro/fósforos', fishing: 'vara de pescar', axe: 'machado', blade: 'faca', saw: 'serrote', hammer: 'martelo', screwdriver: 'chave de fenda', wrench: 'chave inglesa', shovel: 'pá', crowbar: 'pé de cabra' };

const fuelOf = (props: Record<string, any>) => Number(props.fuelMinutes ?? 0);
const isFood = (cat: string) => cat === 'food';

/** Brilho de fogueira sobre o cenário. */
export function CampfireGlow() {
  const scene = useGame((s) => s.scene);
  if (!scene?.campfire?.lit) return null;
  return (
    <>
      <div className="absolute inset-0 pointer-events-none fire-flicker" style={{ background: 'radial-gradient(ellipse 70% 45% at 50% 100%, rgba(255,140,40,.32), rgba(255,90,20,.08) 55%, transparent 75%)', mixBlendMode: 'screen' }} />
      <div className="absolute bottom-0 inset-x-0 h-24 pointer-events-none fire-flicker" style={{ background: 'linear-gradient(to top, rgba(255,120,30,.18), transparent)', animationDelay: '-.7s' }} />
    </>
  );
}

/** Itens da cena: fogueira, fumaça vista ao longe, cachorros de rua. */
export function NatureHotspots() {
  const { scene, self } = useGame();
  const [fire, setFire] = useState(false);
  const [dog, setDog] = useState<SceneDog | null>(null);
  if (!scene || !self) return null;
  const strays = (scene.dogs ?? []).filter((d) => d.status === 'stray');
  return (
    <>
      {scene.campfire?.lit && (
        <Hotspot icon="fire" tone="warm" onClick={() => setFire(true)}>Fogueira acesa, mais {fmtDuration(scene.campfire.minutesLeft * 60000)}</Hotspot>
      )}
      {strays.map((d) => <Hotspot key={d.id} icon="dog" onClick={() => setDog(d)}>Cachorro de rua</Hotspot>)}
      {(scene.smokeNearby?.length ?? 0) > 0 && (
        <Tip text="Fumaça de fogueira subindo de um local vizinho — alguém está acampado ali.">
          <span className="chip text-ink-200 self-center"><GameIcon name="smoke" size={13} />Fumaça subindo em {scene.smokeNearby!.join(', ')}</span>
        </Tip>
      )}
      {fire && <FireModal onClose={() => setFire(false)} />}
      {dog && <TameModal dog={dog} onClose={() => setDog(null)} />}
    </>
  );
}

/** Botões de fogueira, caça e pesca na barra de ações. */
export function NatureActions({ busy }: { busy: boolean }) {
  const { scene, self } = useGame();
  const [fire, setFire] = useState(false);
  if (!scene || !self) return null;
  const idle = self.state === 'idle' && !busy;
  return (
    <>
      {scene.campfire && (
        <Tip text={!scene.campfire.canHaveFire ? 'Aqui dentro não dá para acender fogo com segurança.\nFogueira só ao ar livre (ruas, floresta, campos, acampamentos) ou em cabanas e casas de fazenda.' : scene.campfire.lit ? 'Alimentar ou apagar a fogueira' : 'Acender uma fogueira: aquece, cozinha e ferve água — mas a fumaça ao ar livre chama atenção.'}>
          <button className="btn" disabled={!scene.campfire.canHaveFire || (!idle && !scene.campfire.lit)} onClick={() => setFire(true)}><GameIcon name="fire" size={18} />{scene.campfire.lit ? 'Fogueira' : 'Acender fogueira'}</button>
        </Tip>
      )}
      {self.dog && <DogScavengeButton disabled={self.state === 'traveling'} />}
      {scene.canHunt && <Tip text="Caçar (15 min). Precisa de arma equipada; tiros fazem barulho."><button className="btn" disabled={!idle} onClick={() => action('hunt')}><GameIcon name="hunt" size={18} />Caçar</button></Tip>}
      {scene.canFish && <Tip text="Pescar (20 min). Precisa de vara de pescar."><button className="btn" disabled={!idle} onClick={() => action('fish')}><GameIcon name="fish" size={18} />Pescar</button></Tip>}
      {fire && <FireModal onClose={() => setFire(false)} />}
    </>
  );
}

function FireModal({ onClose }: { onClose: () => void }) {
  const { scene, self } = useGame();
  if (!scene || !self) return null;
  const fuels = self.inventory.filter((i) => !i.slot && fuelOf(i.props) > 0);
  const hasLighter = self.inventory.some((i) => i.props.fire);
  const lit = !!scene.campfire?.lit;
  return (
    <Modal title={lit ? 'Fogueira' : 'Acender fogueira'} onClose={onClose}>
      <div className="text-sm text-ink-300 space-y-2">
        {lit ? <p>O fogo vai durar mais <b className="text-orange-300">{fmtDuration((scene.campfire?.minutesLeft ?? 0) * 60000)}</b>. Aquece quem está aqui, permite cozinhar, assar, defumar e ferver água.</p>
          : <p>Escolha o combustível. {hasLighter ? '' : <span className="text-blood-400">Você precisa de isqueiro ou fósforos.</span>}</p>}
        {!scene.location.indoor && <p className="text-xs text-ink-400">Ao ar livre a fumaça é vista dos locais vizinhos e os infectados encontram vocês com mais facilidade. Com chuva forte pode não pegar.</p>}
      </div>
      <Section title={lit ? 'Alimentar o fogo' : 'Combustível'}>
        {fuels.length ? <div className="flex flex-wrap gap-1.5">{fuels.map((i) => (
          <button key={i.id} className="btn !py-1" disabled={!lit && !hasLighter} onClick={() => { action('fire_light', { itemId: i.id }); onClose(); }}>
            {i.name}{i.quantity > 1 ? ` ×${i.quantity}` : ''} <span className="text-ink-400 normal-case">+{fmtDuration(fuelOf(i.props) * 60000)}</span>
          </button>))}</div>
          : <div className="text-xs text-ink-400">Nenhum combustível no inventário. Lenha (rache uma tora com machado), tábuas e toras queimam.</div>}
      </Section>
      <div className="flex justify-end gap-2 mt-4">
        {lit && <button className="btn btn-danger" onClick={() => { action('fire_out'); onClose(); }}>Apagar</button>}
        <button className="btn" onClick={onClose}>Fechar</button>
      </div>
    </Modal>
  );
}

function TameModal({ dog, onClose }: { dog: SceneDog; onClose: () => void }) {
  const self = useGame((s) => s.self)!;
  const foods = self.inventory.filter((i) => !i.slot && isFood(i.category));
  return (
    <Modal title="Cachorro de rua" onClose={onClose}>
      <p className="text-sm text-ink-200 italic">{dog.look ? dog.look[0].toUpperCase() + dog.look.slice(1) : 'Um cachorro magro'}. Ele mantém distância, de olho na sua mochila.</p>
      <div className="mt-3 w-48"><Bar label="Confiança" value={dog.trust} color="#7a8c4e" small /></div>
      {self.dog ? <p className="text-sm text-ink-400 mt-3">Você já tem {self.dog.name}. Cada sobrevivente só consegue cuidar de um cachorro — outro jogador pode conquistar este.</p>
        : <p className="text-xs text-ink-400 mt-3">Ofereça comida. Carne e peixe conquistam mais rápido; habilidade de sobrevivência ajuda.</p>}
      <Section title="Oferecer">
        {foods.length ? <div className="flex flex-wrap gap-1.5">{foods.map((i) => (
          <button key={i.id} className="btn !py-1" disabled={!!self.dog} onClick={async () => { await action('dog_tame', { dogId: dog.id, itemId: i.id }); onClose(); }}>{i.name}{i.quantity > 1 ? ` ×${i.quantity}` : ''}</button>
        ))}</div> : <div className="text-xs text-ink-400">Você não tem comida.</div>}
      </Section>
      <div className="flex justify-end mt-4"><button className="btn" onClick={onClose}>Fechar</button></div>
    </Modal>
  );
}

/** Seção do companheiro no painel do personagem. */
export function CompanionSection() {
  const self = useGame((s) => s.self)!;
  const [name, setName] = useState(self.dog?.name ?? '');
  const [release, setRelease] = useState(false);
  const d = self.dog;
  if (!d) return (
    <Section title="Companheiro">
      <div className="text-xs text-ink-400">Nenhum. Cachorros de rua aparecem às vezes quando você vasculha casas, ruas e fazendas — conquiste um com comida.</div>
    </Section>
  );
  const foods = self.inventory.filter((i) => !i.slot && isFood(i.category));
  const meds = self.inventory.filter((i) => !i.slot && DOG_MEDS[i.defId]);
  return (
    <Section title="Companheiro">
      <div className="flex items-start gap-3">
        <img src={dogImg(d.variant)} alt="" className="w-16 h-14 object-contain object-bottom" />
        <div className="flex-1 min-w-0">
          <div className="flex gap-2"><input className="input !py-1 text-sm" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn !py-1" disabled={name.trim() === d.name || name.trim().length < 2} onClick={() => action('dog_rename', { name: name.trim() })}>Renomear</button></div>
          <div className="text-xs text-ink-400 italic mt-1">{d.look}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3">
        <Bar label="Saúde" value={d.health} color={d.health < 30 ? '#d1382f' : '#7a8c4e'} small />
        <Bar label="Saciedade" value={100 - d.hunger} color="#d98c1a" small />
        <Bar label="Lealdade" value={d.loyalty} color="#8b7fb8" small />
      </div>
      <div className="text-xs text-ink-400 mt-2">Segue você, rosna quando infectados se aproximam (menos emboscadas), fareja itens ao vasculhar, ajuda na caça e morde infectados no combate. Dá para mandar farejar sozinho e ele traz coisas pequenas. Com fome por muito tempo, vai embora.</div>
      <DogStatus />
      <div className="flex flex-wrap gap-1.5 mt-2">
        <DogScavengeButton disabled={self.state === 'traveling'} />
        <CooldownButton until={d.petReadyAt} label="Fazer carinho" icon="dog" title="Alivia um pouco o seu estresse e aumenta a lealdade (de hora em hora)" onClick={() => action('dog_pet')} />
      </div>
      <div className="label mt-3 mb-1">Cuidar dos machucados</div>
      {meds.length && d.health < 100 ? <div className="flex flex-wrap gap-1.5">{meds.map((i) => <CooldownButton key={i.id} until={d.treatReadyAt} label={`${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`} title={`Recupera ~${DOG_MEDS[i.defId]}% da saúde (mais com Medicina)`} onClick={() => action('dog_treat', { itemId: i.id })} />)}</div>
        : <div className="text-xs text-ink-400">{d.health >= 100 ? `${d.name} está inteiro.` : 'Sem item médico no inventário (curativo, trapo, kit de primeiros socorros, antibiótico…).'}</div>}
      <div className="label mt-3 mb-1">Alimentar</div>
      {foods.length ? <div className="flex flex-wrap gap-1.5">{foods.map((i) => <button key={i.id} className="btn !py-1" onClick={() => action('dog_feed', { itemId: i.id })}>{i.name}{i.quantity > 1 ? ` ×${i.quantity}` : ''}</button>)}</div>
        : <div className="text-xs text-ink-400">Sem comida no inventário.</div>}
      <div className="mt-3">{release ? <span className="flex gap-2 items-center text-xs">Soltar {d.name} de vez? <button className="btn btn-danger !py-1" onClick={() => action('dog_release')}>Soltar</button><button className="btn !py-1" onClick={() => setRelease(false)}>Não</button></span>
        : <button className="btn btn-ghost !py-1 text-xs" onClick={() => setRelease(true)}>Soltar o cachorro</button>}</div>
    </Section>
  );
}

/** Ícone do cachorro ao lado do retrato do dono. */
export function DogBadge({ ownerId }: { ownerId: number }) {
  const dog = useGame((s) => s.scene?.dogs?.find((d) => d.ownerId === ownerId && d.status === 'owned'));
  if (!dog) return null;
  return <span className="chip text-tape" title={dog.look}><GameIcon name="dog" size={12} />{dog.name}</span>;
}

// ───────────────────────── Cachorros no cenário ─────────────────────────
export const dogImg = (v: DogVariant) => `/assets/dogs/dog_${v}.png`;
/** Para que lado cada imagem olha originalmente. */
const FACES_LEFT: Record<DogVariant, boolean> = { caramelo: true, pastor: true, preto: false };
function DogFigure({ variant, face, className = '', style, walking, title, onClick }: { variant: DogVariant; face: 'left' | 'right'; className?: string; style?: React.CSSProperties; walking?: boolean; title?: string; onClick?: () => void }) {
  const flip = (face === 'left') !== FACES_LEFT[variant];
  return (
    <div className={`absolute pointer-events-auto ${onClick ? 'cursor-pointer' : ''} ${className}`} style={style} title={title} onClick={onClick}
      {...(onClick ? { role: 'button', tabIndex: 0, 'aria-label': title, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } } : {})}>
      <div className={`h-full ${walking ? 'walk-bob' : 'dog-idle'}`}>
        <img src={dogImg(variant)} alt="" draggable={false} className="h-full w-auto max-w-none object-contain object-bottom drop-shadow-[0_10px_16px_rgba(0,0,0,.85)] hover:brightness-110 transition" style={{ transform: flip ? 'scaleX(-1)' : undefined }} />
      </div>
    </div>
  );
}

/** Cachorro do personagem, ao pé do retrato do dono. */
export function OwnerDog({ ownerId, isSelf, walking }: { ownerId: number; isSelf: boolean; walking?: boolean }) {
  const sceneDog = useGame((s) => s.scene?.dogs?.find((d) => d.ownerId === ownerId && d.status === 'owned'));
  const selfDog = useGame((s) => (isSelf ? s.self?.dog : null));
  const dog = sceneDog ?? selfDog;
  if (!dog) return null;
  if ((sceneDog && sceneDog.away) || (selfDog?.awayUntil && new Date(selfDog.awayUntil).getTime() > Date.now())) return null; // saiu farejando
  return <DogFigure variant={dog.variant} face="right" walking={walking} title={`${dog.name} — ${dog.look}`} className="bottom-[1%] -left-[18%] h-[30%] z-[1]" />;
}

/** Cachorros de rua aparecem no canto do cenário, desconfiados; clicar abre a oferta de comida. */
export function StrayDogs() {
  const dogs = useGame((s) => s.scene?.dogs);
  const strays = (dogs ?? []).filter((d) => d.status === 'stray');
  const [dog, setDog] = useState<SceneDog | null>(null);
  return (
    <>
      {strays.slice(0, 2).map((d, i) => (
        <DogFigure key={d.id} variant={d.variant} face={i ? 'left' : 'right'} title="Cachorro de rua — clique para oferecer comida" onClick={() => setDog(d)}
          className={`bottom-[2%] h-[24%] z-[3] opacity-95 ${i ? 'right-[4%]' : 'left-[4%]'}`} />
      ))}
      {dog && <TameModal dog={dog} onClose={() => setDog(null)} />}
    </>
  );
}

/** Quanto cada item médico recupera do cachorro (espelha o servidor). */
const DOG_MEDS: Record<string, number> = { first_aid_kit: 45, surgical_supplies: 35, suture_kit: 30, antibiotics: 25, bandage: 20, splint: 15, rag: 12, antiseptic: 10, painkillers: 8, dirty_rag: 6 };

const minsLeft = (iso?: string | null) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000)) : 0);

function CooldownButton({ until, label, title, icon, onClick }: { until?: string | null; label: string; title: string; icon?: string; onClick: () => void }) {
  const left = minsLeft(until);
  return <Tip text={left ? `${title}\nDisponível em ${left} min.` : title}><button className="btn !py-1" disabled={left > 0} onClick={onClick}>{icon && <GameIcon name={icon} size={15} />}{label}{left ? ` (${left} min)` : ''}</button></Tip>;
}

/** Mandar o cachorro farejar o local sozinho (traz coisas pequenas; tem recarga). */
function DogScavengeButton({ disabled }: { disabled?: boolean }) {
  const d = useGame((s) => s.self?.dog);
  if (!d) return null;
  const away = minsLeft(d.awayUntil);
  const why = away ? `${d.name} está farejando (volta em ~${away} min).` : d.health < 40 ? `${d.name} está machucado demais para sair sozinho.` : d.hunger > 75 ? `${d.name} está com fome demais para sair.` : '';
  if (why) return <Tip text={why}><button className="btn !py-1" disabled><GameIcon name="dog" size={16} />{away ? `${d.name} farejando…` : `Mandar ${d.name} farejar`}</button></Tip>;
  return <CooldownButton until={d.scavengeReadyAt} label={`Mandar ${d.name} farejar`} icon="dog" title={`${d.name} vasculha o lugar sozinho por alguns minutos e traz o que couber na boca (comida, remédio, munição…). Lugar com infectados pode machucá-lo.`} onClick={() => !disabled && action('dog_scavenge')} />;
}

function DogStatus() {
  const d = useGame((s) => s.self?.dog);
  if (!d) return null;
  const away = minsLeft(d.awayUntil);
  if (!away && d.health >= 40) return null;
  return <p className="text-[12.5px] text-amber-200 mt-1.5">{away ? `${d.name} saiu farejando e volta em ~${away} min. Enquanto isso, não ajuda em combate nem na caça.` : `${d.name} está machucado: cuide dele para ele voltar a sair sozinho.`}</p>;
}
