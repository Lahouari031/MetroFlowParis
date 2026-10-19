'use client';

import { Bell, BellOff, Moon, Radio, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { loadNetwork } from '@/data/network';
import { fmtClock } from '@/lib/metrics';
import { FeedBuilder, type FeedPost, type PostTone } from '@/lib/trafficFeed';
import { useSelection, useSimulation } from '@/store/simulationStore';
import { cx, LineBadge } from '../ui/primitives';

const MAX_POSTS = 200;
const MAX_TOASTS = 2;
const TOAST_MS = 7000;

interface FeedStore {
  posts: FeedPost[];
  /** Notifications affichées en bas à droite (ids de publications). */
  toasts: number[];
  unread: number;
  /** Notifications : toutes, seulement mes lignes, ou coupées. */
  notify: 'all' | 'mine' | 'off';
}

export const useFeed = create<FeedStore>(() => ({ posts: [], toasts: [], unread: 0, notify: 'all' }));

let builder: FeedBuilder | null = null;
let lastId = 0;

/** Transforme les nouveaux événements du moteur en publications (et en notifications si la partie est en cours). */
function ingest() {
  const sim = useSimulation.getState();
  const network = loadNetwork().network;
  if (!network) return;
  builder ??= new FeedBuilder(network);
  const events = sim.events;
  const incidents = sim.snapshot?.incidents ?? [];
  const maxId = events.length ? events[events.length - 1].id : 0;
  // Nouvelle partie, retour en arrière ou rejeu : le fil est reconstruit sans notifications.
  const rebuild = maxId < lastId;
  if (rebuild) {
    builder.reset();
    lastId = 0;
  }
  const fresh = events.filter((e) => e.id > lastId);
  if (!fresh.length && !rebuild) return;
  lastId = Math.max(lastId, maxId);
  const posts: FeedPost[] = [];
  for (const ev of fresh) {
    const p = builder.build(ev, incidents, sim.managedLines);
    if (p) posts.push(p);
  }
  const st = useFeed.getState();
  if (rebuild) {
    useFeed.setState({ posts: posts.reverse().slice(0, MAX_POSTS), toasts: [], unread: 0 });
    return;
  }
  if (!posts.length) return;
  const live = !sim.busy;
  const toastable = live && st.notify !== 'off' ? posts.filter((p) => (st.notify === 'all' ? p.tone !== 'player' : p.mine && p.tone !== 'player')) : [];
  useFeed.setState({
    posts: [...posts.reverse(), ...st.posts].slice(0, MAX_POSTS),
    toasts: [...toastable.map((p) => p.id).reverse(), ...st.toasts].slice(0, MAX_TOASTS),
    unread: st.unread + posts.length,
  });
}

/** À monter une fois : écoute le flux d'événements de la simulation. */
export function useTrafficFeedSync() {
  useEffect(() => {
    lastId = 0;
    builder = null;
    ingest();
    return useSimulation.subscribe((s, prev) => {
      // Nouvelle partie ou changement de lignes gérées : reconstruction complète du fil.
      const reset = s.managedLines !== prev.managedLines || s.scenarioTitle !== prev.scenarioTitle || s.seed !== prev.seed || s.startTime !== prev.startTime;
      if (reset) lastId = Number.MAX_SAFE_INTEGER;
      if (reset || s.events !== prev.events) ingest();
    });
  }, []);
}

const TONE_STYLE: Record<PostTone, string> = {
  alert: 'border-l-red-500',
  ok: 'border-l-emerald-500',
  info: 'border-l-sky-500',
  crowd: 'border-l-amber-500',
  night: 'border-l-slate-700',
  player: 'border-l-violet-500',
};

function Avatar({ post, size = 34 }: { post: FeedPost; size?: number }) {
  if (post.author === 'line' && post.line) return <LineBadge line={post.line} size={size} className="ring-2 ring-white" />;
  const Icon = post.author === 'player' ? SlidersHorizontal : post.tone === 'night' ? Moon : Radio;
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full text-white ring-2 ring-white', post.author === 'player' ? 'bg-violet-600' : 'bg-slate-800')}
      style={{ width: size, height: size }}
    >
      <Icon size={size * 0.5} />
    </span>
  );
}

function authorName(p: FeedPost): [string, string] {
  if (p.author === 'player') return ['Régulation (vous)', '@poste_de_commande'];
  if (p.author === 'line' && p.line) return [`Ligne ${p.line}`, `@ligne${p.line}_info`];
  return ['Info trafic MétroFlow', '@metroflow_info'];
}

function PostBody({ post, compact }: { post: FeedPost; compact?: boolean }) {
  const [name, handle] = authorName(post);
  return (
    <div className="flex min-w-0 gap-2.5">
      <Avatar post={post} size={compact ? 28 : 34} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1 text-[12px] leading-tight">
          <span className="truncate font-bold text-ink">{name}</span>
          <span className="truncate text-faint">{handle}</span>
          <span className="shrink-0 text-faint">· {fmtClock(post.time)}</span>
        </div>
        <p className="mt-0.5 text-[12px] leading-snug text-ink/90">{post.text}</p>
        {post.tags.length > 0 && <p className="mt-0.5 text-[11px] text-sky-700">{post.tags.join(' ')}</p>}
      </div>
    </div>
  );
}

function openPost(p: FeedPost) {
  const sel = useSelection.getState();
  if (p.incidentId) sel.select({ kind: 'incident', id: p.incidentId });
  else if (p.stationId) {
    sel.select({ kind: 'station', id: p.stationId });
    sel.focusStation(p.stationId);
  }
}

/** Notifications façon réseau social, en bas à droite, à chaque perturbation. */
export function FeedToasts() {
  const toasts = useFeed((s) => s.toasts);
  const posts = useFeed((s) => s.posts);
  const shown = toasts.map((id) => posts.find((p) => p.id === id)).filter((p): p is FeedPost => !!p);
  return (
    <div className="pointer-events-none fixed bottom-[84px] right-[330px] z-[115] flex w-[310px] flex-col-reverse gap-2 max-lg:right-4" aria-live="polite">
      {shown.map((p) => (
        <Toast key={p.id} post={p} />
      ))}
    </div>
  );
}

function Toast({ post }: { post: FeedPost }) {
  useEffect(() => {
    const t = setTimeout(() => dismiss(post.id), TOAST_MS);
    return () => clearTimeout(t);
  }, [post.id]);
  return (
    <div
      role="status"
      className={cx('feed-toast pointer-events-auto relative cursor-pointer rounded-xl border border-l-4 border-edge bg-white/95 p-2.5 pr-7 shadow-lg backdrop-blur', TONE_STYLE[post.tone])}
      onClick={() => {
        openPost(post);
        dismiss(post.id);
      }}
    >
      <PostBody post={post} compact />
      <button
        type="button"
        aria-label="Fermer la notification"
        className="absolute right-2 top-2 rounded p-0.5 text-faint hover:bg-panel-3 hover:text-ink"
        onClick={(e) => {
          e.stopPropagation();
          dismiss(post.id);
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

function dismiss(id: number) {
  useFeed.setState((s) => ({ toasts: s.toasts.filter((t) => t !== id) }));
}

/** Fil complet (carte du panneau de droite). */
export function FeedPanel() {
  const posts = useFeed((s) => s.posts);
  const notify = useFeed((s) => s.notify);
  const managed = useSimulation((s) => s.managedLines);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  useEffect(() => {
    useFeed.setState({ unread: 0 });
  }, [posts]);
  const list = filter === 'mine' ? posts.filter((p) => p.mine) : posts;
  const cycle = () => useFeed.setState({ notify: notify === 'all' ? (managed ? 'mine' : 'off') : notify === 'mine' ? 'off' : 'all' });
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[11px]">
        {managed && (
          <>
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              Tout
            </FilterChip>
            <FilterChip active={filter === 'mine'} onClick={() => setFilter('mine')}>
              Mes lignes
            </FilterChip>
          </>
        )}
        <button
          type="button"
          onClick={cycle}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-faint hover:bg-panel-3 hover:text-ink"
          title="Notifications en bas à droite"
        >
          {notify === 'off' ? <BellOff size={12} /> : <Bell size={12} />}
          {notify === 'all' ? 'Notifs : toutes' : notify === 'mine' ? 'Notifs : mes lignes' : 'Notifs coupées'}
        </button>
      </div>
      {list.length === 0 ? (
        <p className="py-3 text-center text-[11px] text-faint">Rien à signaler pour l&apos;instant. Les perturbations apparaîtront ici.</p>
      ) : (
        <ul className="panel-scroll max-h-[300px] divide-y divide-edge">
          {list.slice(0, 60).map((p) => (
            <li key={p.id} className={cx('cursor-pointer py-2 hover:bg-panel-3/50', !p.mine && 'opacity-60')} onClick={() => openPost(p)}>
              <PostBody post={p} compact />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[10px] text-faint">Comptes et messages fictifs générés par la simulation.</p>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className={cx('rounded-full px-2 py-0.5 font-medium', active ? 'bg-ink text-white' : 'text-muted hover:bg-panel-3')}>
      {children}
    </button>
  );
}

/** Badge du nombre de publications non lues. */
export function FeedUnread() {
  const unread = useFeed((s) => s.unread);
  if (!unread) return null;
  return <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>;
}
