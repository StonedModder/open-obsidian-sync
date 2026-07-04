import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudDownload,
  CloudUpload,
  Download,
  Database,
  FileStack,
  FolderOpen,
  FolderSearch,
  HelpCircle,
  Info,
  KeyRound,
  Lock,
  Pause,
  Play,
  Plus,
  PlusCircle,
  RefreshCw,
  Settings,
  Sparkles,
  Terminal,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { SlotText } from "slot-text/react";
import { GradientShimmer, type GradientStop } from "gradient-shimmer";
import type { ElementType } from "react";
import {
  defaultConflictStrategy,
  type ActivityEntry,
  type AddVaultInput,
  type AppState,
  type ConflictStrategy,
  type Provider,
  type ScanResult,
  type SelectiveSyncSettings,
  type VaultConfig
} from "../shared/types";

type PanelTab = "cloud" | "add" | "settings";
type ToastKind = "info" | "success" | "warning" | "error" | "progress";

interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  detail?: string;
  percent?: number;
  indeterminate?: boolean;
  sticky?: boolean;
}

const toastTitle: Record<ToastKind, string> = {
  info: "Notice",
  success: "Done",
  warning: "Heads up",
  error: "Something went wrong",
  progress: "Working…"
};

// Cheap kind inference so a plain string message still gets the right color/title.
const inferKind = (message: string): ToastKind => {
  if (/\b(fail|failed|error|unavailable|cannot|can't|not found|denied|invalid|missing)\b/i.test(message)) return "error";
  if (/\b(saved|added|created|complete|completed|ready|deleted|removed|restored|backed up|installed|opened)\b/i.test(message)) return "success";
  return "info";
};

let toastSeq = 0;

interface UiStore {
  appState?: AppState;
  selectedVaultId?: string;
  toasts: Toast[];
  panelTab: PanelTab;
  setAppState: (appState: AppState) => void;
  selectVault: (vaultId: string) => void;
  setNotice: (notice?: string, kind?: ToastKind) => void;
  pushToast: (toast: Omit<Toast, "id"> & { id?: string }) => string;
  dismissToast: (id: string) => void;
  setPanelTab: (tab: PanelTab) => void;
}

const useUiStore = create<UiStore>((set, get) => ({
  toasts: [],
  panelTab: "cloud",
  setAppState: (appState) =>
    set({
      appState,
      selectedVaultId:
        get().selectedVaultId && appState.vaults.some((vault) => vault.id === get().selectedVaultId)
          ? get().selectedVaultId
          : appState.vaults[0]?.id
    }),
  selectVault: (vaultId) => set({ selectedVaultId: vaultId }),
  setNotice: (notice, kind) => {
    if (!notice) return;
    const k = kind ?? inferKind(notice);
    get().pushToast({ kind: k, title: toastTitle[k], message: notice });
  },
  pushToast: (toast) => {
    const id = toast.id ?? `t${++toastSeq}`;
    set((state) => {
      const exists = state.toasts.some((item) => item.id === id);
      const next: Toast = { ...toast, id };
      return {
        toasts: exists ? state.toasts.map((item) => (item.id === id ? next : item)) : [...state.toasts, next].slice(-4)
      };
    });
    return id;
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
  setPanelTab: (panelTab) => set({ panelTab })
}));

const providers: Array<{ id: Provider; label: string; hint: string }> = [
  { id: "google-drive", label: "Google Drive", hint: "rclone type · drive" },
  { id: "dropbox", label: "Dropbox", hint: "rclone type · dropbox" },
  { id: "proton-drive", label: "Proton Drive", hint: "rclone type · protondrive" },
  { id: "custom-rclone", label: "Custom rclone", hint: "any configured remote" }
];

const selectiveSyncOptions: Array<{ key: keyof SelectiveSyncSettings; label: string }> = [
  { key: "images", label: "Images" },
  { key: "audio", label: "Audio" },
  { key: "videos", label: "Videos" },
  { key: "pdfs", label: "PDFs" }
];

const conflictStrategyOptions: Array<{ id: ConflictStrategy; label: string }> = [
  { id: "newer", label: "Keep newer" },
  { id: "older", label: "Keep older" },
  { id: "larger", label: "Keep larger" },
  { id: "smaller", label: "Keep smaller" },
  { id: "path1", label: "Prefer local" },
  { id: "path2", label: "Prefer remote" },
  { id: "none", label: "Keep both" }
];

const defaultSelectiveSync = (): SelectiveSyncSettings => ({ images: true, audio: true, videos: true, pdfs: true });

const statusClass = (status: VaultConfig["status"]) => `status-${status}`;
const fmt = (value?: string) => (value ? new Date(value).toLocaleString() : "—");
const compactPath = (value: string) => value.replace(/^([A-Za-z]:\\Users\\[^\\]+\\)/i, "~\\");

// Violet shimmer band tuned to the theme — light lilac highlight sweeping violet.
const shimmerBand: GradientStop[] = [
  { position: 0, color: "#8b5cf6" },
  { position: 0.5, color: "#f5f0ff" },
  { position: 1, color: "#8b5cf6" }
];

function Shimmer({ children, className, as }: { children: string; className?: string; as?: ElementType }) {
  return (
    <GradientShimmer as={as} className={className} gradient={shimmerBand} spread={4} duration={1.9} pauseBetween={2400}>
      {children}
    </GradientShimmer>
  );
}

// Hover/focus tooltip for a settings label. Keyboard-accessible via tabIndex.
function Tip({ text }: { text: string }) {
  return (
    <span className="tip" tabIndex={0} role="note" aria-label={text}>
      <HelpCircle className="tip-ic h-3.5 w-3.5" />
      <span className="tip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}

// An eyebrow label with an inline help tooltip — used across all forms.
function FieldLabel({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="eyebrow">{label}</span>
      <Tip text={tip} />
    </span>
  );
}

function FacetMark({ size = 40 }: { size?: number }) {
  return (
    <svg className="facet" width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <path d="M258 48 402 138 448 300 322 462 136 420 70 236 152 92Z" fill="#7c3aed" />
      <path d="M258 48 402 138 210 246 152 92Z" fill="#a78bfa" />
      <path d="M210 246 322 462 136 420 70 236Z" fill="#4c1d95" />
      <path d="M152 92 258 384M402 138 210 246" stroke="#d8b4fe" strokeWidth="6" strokeLinecap="round" />
      <path d="M336 224a104 76 0 0 0-160 66" fill="none" stroke="#f5f3ff" strokeWidth="18" strokeLinecap="round" />
      <path d="M176 290 154 288 166 270Z" fill="#f5f3ff" />
      <path d="M176 288a104 76 0 0 0 160-66" fill="none" stroke="#f5f3ff" strokeWidth="18" strokeLinecap="round" />
      <path d="M336 222 358 224 346 242Z" fill="#f5f3ff" />
    </svg>
  );
}

export function App() {
  const { appState, selectedVaultId, toasts, panelTab, setAppState, selectVault, setNotice, pushToast, dismissToast, setPanelTab } =
    useUiStore();
  const [search, setSearch] = useState("");
  const [replayHelp, setReplayHelp] = useState(false);
  const wasInstalling = useRef(false);

  useEffect(() => {
    void window.openObsidianSync.getState().then(setAppState);
    return window.openObsidianSync.onState(setAppState);
  }, [setAppState]);

  // Drive a sticky progress toast for the rclone auto-install, then flip it to a
  // success/error toast that auto-dismisses when setup finishes.
  useEffect(() => {
    if (!appState) return;
    const { rcloneInstalling, rcloneDownloadPercent, rcloneDownloadDetail, rcloneAvailable } = appState;
    if (rcloneInstalling) {
      pushToast({
        id: "rclone-install",
        kind: "progress",
        title: "Setting up sync engine",
        message: rcloneDownloadPercent === undefined ? "Locating rclone…" : "Downloading rclone",
        detail: rcloneDownloadDetail,
        percent: rcloneDownloadPercent,
        indeterminate: rcloneDownloadPercent === undefined,
        sticky: true
      });
    } else if (wasInstalling.current) {
      pushToast(
        rcloneAvailable
          ? { id: "rclone-install", kind: "success", title: "Sync engine ready", message: "rclone installed and verified.", percent: 100 }
          : { id: "rclone-install", kind: "error", title: "rclone setup failed", message: "Open Cloud setup to retry the install." }
      );
    }
    wasInstalling.current = rcloneInstalling;
  }, [appState, pushToast]);

  const selectedVault = appState?.vaults.find((vault) => vault.id === selectedVaultId);
  const logs = useMemo(() => {
    const all = appState?.logs ?? [];
    return all
      .filter((entry) => !selectedVault || !entry.vaultId || entry.vaultId === selectedVault.id)
      .filter((entry) => `${entry.message} ${entry.detail ?? ""}`.toLowerCase().includes(search.toLowerCase()))
      .slice(0, 150);
  }, [appState?.logs, search, selectedVault]);

  if (!appState) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 text-[var(--muted)]">
          <FacetMark size={28} />
          <span className="eyebrow">Loading station…</span>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen">
      {/* ---------- LEFT RAIL ---------- */}
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-[var(--hairline-soft)]">
        <div className="flex items-center gap-3 px-5 pb-5 pt-6">
          <FacetMark size={38} />
          <div>
            <Shimmer as="div" className="display text-[17px] text-[var(--bone)]">Open Obsidian Sync</Shimmer>
            <div className="eyebrow mt-1">Bring-your-own-cloud station</div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 pb-2">
          <span className="eyebrow">Vaults</span>
          <SlotText
            className="mono text-[11px] text-[var(--faint)]"
            text={String(appState.vaults.length).padStart(2, "0")}
            options={{ direction: "up" }}
          />
        </div>

        <div className="flex-1 space-y-2 overflow-auto px-4 pb-3">
          {appState.vaults.length === 0 && (
            <button
              className="w-full rounded border border-dashed border-[var(--hairline)] px-4 py-6 text-center transition hover:border-[var(--ember-line)]"
              onClick={() => setPanelTab("add")}
            >
              <Plus className="mx-auto mb-2 h-5 w-5 text-[var(--ember)]" />
              <div className="mono text-[11px] uppercase tracking-widest text-[var(--muted)]">Add first vault</div>
            </button>
          )}
          {appState.vaults.map((vault, index) => (
            <button
              key={vault.id}
              data-active={vault.id === selectedVaultId}
              className={`specimen rise ${statusClass(vault.status)}`}
              style={{ animationDelay: `${index * 45}ms` }}
              onClick={() => selectVault(vault.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-[var(--bone)]">{vault.name}</div>
                  <div className="mono mt-1 truncate text-[11px] text-[var(--faint)]">{compactPath(vault.localPath)}</div>
                </div>
                <span className={`dot mt-1 ${vault.status === "syncing" ? "pulse" : ""}`} />
              </div>
            </button>
          ))}
        </div>

        <div className="border-t border-[var(--hairline-soft)] p-4">
          <button className="btn w-full" onClick={() => setPanelTab("add")}>
            <Plus className="h-4 w-4" />
            New vault
          </button>
        </div>
      </aside>

      {/* ---------- CENTER ---------- */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-end justify-between gap-4 px-8 pb-5 pt-7">
          <div className="min-w-0">
            <div className="eyebrow mb-2">{selectedVault ? "Vault station" : "Welcome"}</div>
            <Shimmer as="h1" className="display block truncate text-[34px] text-[var(--bone)]">
              {selectedVault?.name ?? "Bring your own cloud"}
            </Shimmer>
            {selectedVault && (
              <div className="mono mt-2 flex items-center gap-2 text-[12px] text-[var(--muted)]">
                <Cloud className="h-3.5 w-3.5" />
                {selectedVault.remote}:{selectedVault.remotePath}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {selectedVault && (
              <>
                <span className={`status-pill ${statusClass(selectedVault.status)}`}>
                  <span className={`dot ${selectedVault.status === "syncing" ? "pulse" : ""}`} />
                  <SlotText text={selectedVault.status} options={{ direction: "up" }} />
                </span>
                <VaultActions vault={selectedVault} setNotice={setNotice} />
              </>
            )}
            <button className="icon-btn" title="Show the walkthrough" onClick={() => setReplayHelp(true)}>
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="grid flex-1 grid-cols-[minmax(0,1fr)_380px] overflow-hidden">
          <div className="overflow-auto px-8 pb-8">
            {selectedVault ? <Dashboard vault={selectedVault} logs={logs} search={search} setSearch={setSearch} /> : <EmptyState onAdd={() => setPanelTab("add")} />}
          </div>
          <div className="overflow-auto border-l border-[var(--hairline-soft)] px-5 py-6">
            <RightPanel
              appState={appState}
              tab={panelTab}
              setTab={setPanelTab}
              selectedVault={selectedVault}
              setNotice={setNotice}
            />
          </div>
        </div>
      </section>

      {(!appState.onboardingComplete || replayHelp) && (
        <OnboardingModal
          appState={appState}
          onGoto={setPanelTab}
          onFinish={() => {
            setReplayHelp(false);
            void window.openObsidianSync.completeOnboarding();
          }}
        />
      )}

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-viewport">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (toast.sticky) return;
    const ms = toast.kind === "error" ? 8000 : 5000;
    const timer = setTimeout(() => onDismiss(toast.id), ms);
    return () => clearTimeout(timer);
  }, [toast.id, toast.sticky, toast.kind, toast.message, onDismiss]);

  const Icon =
    toast.kind === "success"
      ? CheckCircle2
      : toast.kind === "error"
        ? AlertTriangle
        : toast.kind === "warning"
          ? AlertTriangle
          : toast.kind === "progress"
            ? CloudDownload
            : Info;
  const showProgress = toast.kind === "progress" || (toast.percent !== undefined && toast.kind === "success");

  return (
    <div className={`toast tk-${toast.kind}`} role="status" aria-live="polite">
      <Icon className={`toast-ic h-[18px] w-[18px] ${toast.kind === "progress" ? "animate-pulse" : ""}`} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Shimmer className="toast-title">{toast.title}</Shimmer>
          {showProgress && toast.percent !== undefined && (
            <span className="mono text-[11px] text-[var(--ember)]">
              <SlotText text={`${toast.percent}%`} options={{ direction: "up" }} />
            </span>
          )}
        </div>
        {toast.message && <div className="toast-msg">{toast.message}</div>}
        {showProgress && (
          <div className="mt-2.5">
            <ProgressBar percent={toast.percent} indeterminate={toast.indeterminate} />
          </div>
        )}
        {toast.detail && <div className="toast-detail">{toast.detail}</div>}
      </div>
      {!toast.sticky && (
        <button className="toast-close" title="Dismiss" onClick={() => onDismiss(toast.id)}>
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function ProgressBar({ percent, indeterminate }: { percent?: number; indeterminate?: boolean }) {
  return (
    <div className="progress" data-indeterminate={indeterminate ? "true" : "false"} role="progressbar" aria-valuenow={percent ?? undefined}>
      <div className="progress-fill" style={indeterminate ? undefined : { width: `${percent ?? 0}%` }} />
    </div>
  );
}

function VaultActions({ vault, setNotice }: { vault: VaultConfig; setNotice: (notice?: string) => void }) {
  const run = async (resync: boolean) => {
    const result = await window.openObsidianSync.runSync(vault.id, resync);
    if (!result.ok) setNotice(result.error);
  };

  return (
    <div className="flex items-center gap-2">
      <button className="btn-ember" onClick={() => run(false)} disabled={vault.status === "syncing"}>
        <RefreshCw className={`h-4 w-4 ${vault.status === "syncing" ? "animate-spin" : ""}`} />
        Sync
      </button>
      <button className="btn" onClick={() => run(true)} disabled={vault.status === "syncing"} title="Rebuild bisync baseline">
        <Download className="h-4 w-4" />
        Resync
      </button>
      <button
        className="icon-btn"
        title={vault.paused ? "Resume" : "Pause"}
        onClick={async () => {
          const result = await window.openObsidianSync.pauseSync(vault.id, !vault.paused);
          if (!result.ok) setNotice(result.error);
        }}
      >
        {vault.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Dashboard({
  vault,
  logs,
  search,
  setSearch
}: {
  vault: VaultConfig;
  logs: ActivityEntry[];
  search: string;
  setSearch: (value: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="readout rise" style={{ animationDelay: "60ms" }}>
        <Gauge icon={<Activity />} label="Last synced" value={fmt(vault.lastSyncedAt)} />
        <Gauge icon={<Database />} label="Files tracked" value={vault.fileCount.toLocaleString()} roll />
        <Gauge icon={<RefreshCw />} label="Pending" value={String(vault.pendingChanges)} accent={vault.pendingChanges > 0} roll />
        <Gauge icon={<FileStack />} label="Config sync" value={vault.includeObsidianConfig ? "On" : "Off"} />
        <Gauge icon={<Settings />} label="Interval" value={`${vault.syncIntervalMinutes}m`} />
      </div>

      {vault.lastError && (
        <div className="rounded border border-[rgba(229,106,92,0.35)] bg-[rgba(229,106,92,0.08)] p-4 rise" style={{ animationDelay: "90ms" }}>
          <div className="mb-2 flex items-center gap-2 text-[var(--clay)]">
            <AlertTriangle className="h-4 w-4" />
            <span className="eyebrow text-[var(--clay)]">Last error</span>
          </div>
          <pre className="mono whitespace-pre-wrap text-[12px] text-[var(--bone-dim)]">{vault.lastError}</pre>
        </div>
      )}

      <div className="panel overflow-hidden rise" style={{ animationDelay: "120ms" }}>
        <div className="flex items-center justify-between border-b border-[var(--hairline)] p-4">
          <div>
            <div className="eyebrow mb-1">Field log</div>
            <div className="text-[13px] text-[var(--muted)]">Uploads · downloads · conflicts · rclone notices</div>
          </div>
          <div className="flex items-center gap-2">
            <input className="field mono h-9 w-52 text-[12px]" placeholder="filter…" value={search} onChange={(event) => setSearch(event.target.value)} />
            <button className="icon-btn" title="Export log as JSON" onClick={() => void window.openObsidianSync.exportLogs()}>
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="max-h-[440px] overflow-auto">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[var(--faint)]">No activity recorded yet.</div>
          ) : (
            logs.map((entry) => <LogRow key={entry.id} entry={entry} />)
          )}
        </div>
      </div>
    </div>
  );
}

function Gauge({ icon, label, value, accent, roll }: { icon: JSX.Element; label: string; value: string; accent?: boolean; roll?: boolean }) {
  return (
    <div className="gauge">
      <div className="flex items-center gap-2 text-[var(--faint)] [&>svg]:h-3.5 [&>svg]:w-3.5">
        <span className="text-[var(--ember)]">{icon}</span>
        <span className="eyebrow">{label}</span>
      </div>
      <div className="gauge-val truncate" style={accent ? { color: "var(--amber)" } : undefined}>
        {roll ? <SlotText text={value} options={{ direction: "up" }} /> : value}
      </div>
    </div>
  );
}

function LogRow({ entry }: { entry: ActivityEntry }) {
  const tick =
    entry.level === "error"
      ? "var(--clay)"
      : entry.level === "warning"
        ? "var(--amber)"
        : entry.level === "success"
          ? "var(--jade)"
          : "var(--hairline)";

  return (
    <div className="logline">
      <span className="log-tick" style={{ background: tick }} />
      <time className="log-time">{new Date(entry.createdAt).toLocaleTimeString()}</time>
      <div className="min-w-0">
        <div className="break-words text-[13px] text-[var(--bone-dim)]">{entry.message}</div>
        {entry.detail && <pre className="mono mt-1.5 whitespace-pre-wrap text-[11px] text-[var(--faint)]">{entry.detail}</pre>}
      </div>
    </div>
  );
}

/* ============================ RIGHT PANEL ============================ */

function RightPanel({
  appState,
  tab,
  setTab,
  selectedVault,
  setNotice
}: {
  appState: AppState;
  tab: PanelTab;
  setTab: (tab: PanelTab) => void;
  selectedVault?: VaultConfig;
  setNotice: (notice?: string) => void;
}) {
  const tabs: Array<{ id: PanelTab; label: string; disabled?: boolean }> = [
    { id: "cloud", label: "Cloud" },
    { id: "add", label: "Add" },
    { id: "settings", label: "Vault", disabled: !selectedVault }
  ];

  return (
    <div className="space-y-4">
      <div className="seg">
        {tabs.map((item) => (
          <button
            key={item.id}
            className="seg-btn"
            data-on={tab === item.id}
            disabled={item.disabled}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "cloud" && <CloudSetup appState={appState} setNotice={setNotice} />}
      {tab === "add" && <AddVaultPanel setNotice={setNotice} onAdded={() => setTab("settings")} goToCloud={() => setTab("cloud")} />}
      {tab === "settings" && selectedVault && <VaultSettings vault={selectedVault} setNotice={setNotice} />}
    </div>
  );
}

interface RemoteField {
  key: string;
  label: string;
  tip: string;
  password?: boolean;
  optional?: boolean;
  obscure?: boolean;
  placeholder?: string;
}

interface RemoteKind {
  type: string;
  label: string;
  kind: "oauth" | "crypt" | "fields" | "custom";
  note?: string;
  fields?: RemoteField[];
}

// Everything the UI needs to configure each provider without a terminal.
const remoteKinds: RemoteKind[] = [
  { type: "drive", label: "Google Drive", kind: "oauth", note: "Opens your browser to sign in to Google. Nothing to type here." },
  { type: "dropbox", label: "Dropbox", kind: "oauth", note: "Opens your browser to sign in to Dropbox." },
  { type: "onedrive", label: "OneDrive", kind: "oauth", note: "Opens your browser to sign in to Microsoft OneDrive." },
  {
    type: "protondrive",
    label: "Proton Drive",
    kind: "fields",
    note: "Proton Drive signs in with your account. Enter your Proton credentials — they are stored encrypted by rclone.",
    fields: [
      { key: "username", label: "Proton email", tip: "The email address you use to log in to Proton.", placeholder: "you@proton.me" },
      { key: "password", label: "Proton password", tip: "Your Proton account password. Stored obscured in the rclone config.", password: true, obscure: true },
      { key: "2fa", label: "2FA code", tip: "Current 6-digit two-factor code, if 2FA is enabled on your Proton account. Leave blank otherwise.", optional: true, placeholder: "123456" }
    ]
  },
  {
    type: "s3",
    label: "S3 / compatible (AWS, Wasabi, R2…)",
    kind: "fields",
    note: "Works with AWS S3 and any S3-compatible provider. Get these from your provider's dashboard.",
    fields: [
      { key: "provider", label: "Provider", tip: "S3 provider name, e.g. AWS, Wasabi, Cloudflare, Minio, Other.", placeholder: "AWS" },
      { key: "access_key_id", label: "Access key ID", tip: "Your S3 access key ID." },
      { key: "secret_access_key", label: "Secret access key", tip: "Your S3 secret access key.", password: true },
      { key: "region", label: "Region", tip: "Bucket region, e.g. us-east-1. Optional for some providers.", optional: true, placeholder: "us-east-1" },
      { key: "endpoint", label: "Endpoint", tip: "Custom S3 endpoint URL. Required for non-AWS providers like Wasabi or R2.", optional: true, placeholder: "s3.wasabisys.com" }
    ]
  },
  { type: "crypt", label: "Encrypted (crypt)", kind: "crypt", note: "Wraps an existing remote so files are encrypted before upload." },
  { type: "custom", label: "Other rclone type…", kind: "custom", note: "For providers not listed here. Create the remote, then finish any extra fields via Advanced CLI." }
];

function SectionHead({ icon, title, note }: { icon: JSX.Element; title: string; note: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 text-[var(--ember)] [&>svg]:h-4 [&>svg]:w-4">
        {icon}
        <Shimmer className="display text-[15px] text-[var(--bone)]">{title}</Shimmer>
      </div>
      <p className="mt-1.5 text-[12px] leading-5 text-[var(--muted)]">{note}</p>
    </div>
  );
}

function CloudSetup({ appState, setNotice }: { appState: AppState; setNotice: (notice?: string) => void }) {
  const [sub, setSub] = useState<"create" | "secure" | "backup">("create");

  return (
    <div className="panel p-4">
      <SectionHead icon={<Cloud />} title="Cloud setup" note="Connect providers, add encryption, and back up your setup — no terminal needed." />
      <div className="mono mb-3 break-all rounded bg-[var(--obsidian)] px-2.5 py-1.5 text-[10.5px] text-[var(--faint)]">
        {appState.rcloneConfigPath}
      </div>

      <RcloneStatus appState={appState} setNotice={setNotice} />


      <div className="seg mb-3">
        {(
          [
            ["create", "Remotes"],
            ["secure", "Encrypt"],
            ["backup", "Backup"]
          ] as const
        ).map(([id, label]) => (
          <button key={id} className="seg-btn" data-on={sub === id} onClick={() => setSub(id)}>
            {label}
          </button>
        ))}
      </div>

      {sub === "create" && <CreateRemote setNotice={setNotice} />}
      {sub === "secure" && <SecureBox appState={appState} setNotice={setNotice} />}
      {sub === "backup" && <BackupBox setNotice={setNotice} />}

      <button
        className="btn mt-3 w-full"
        onClick={async () => {
          const result = await window.openObsidianSync.openRcloneConfig();
          setNotice(result.ok ? "Advanced rclone config terminal opened." : result.error);
        }}
      >
        <Terminal className="h-3.5 w-3.5" />
        Advanced CLI
      </button>
    </div>
  );
}

function RcloneStatus({ appState, setNotice }: { appState: AppState; setNotice: (notice?: string) => void }) {
  if (appState.rcloneInstalling) {
    const pct = appState.rcloneDownloadPercent;
    return (
      <div className="mb-3 rounded border border-[var(--ember-line)] bg-[var(--ember-soft)] p-3">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CloudDownload className="h-4 w-4 animate-pulse text-[var(--ember)]" />
            <Shimmer className="display text-[13px] text-[var(--bone)]">Setting up sync engine</Shimmer>
          </div>
          {pct !== undefined && (
            <span className="mono text-[11px] text-[var(--ember)]">
              <SlotText text={`${pct}%`} options={{ direction: "up" }} />
            </span>
          )}
        </div>
        <ProgressBar percent={pct} indeterminate={pct === undefined} />
        <div className="mono mt-2 text-[10.5px] text-[var(--faint)]">
          {appState.rcloneDownloadDetail ?? "Contacting downloads.rclone.org…"}
        </div>
      </div>
    );
  }

  if (!appState.rcloneAvailable) {
    return (
      <div className="mb-3 rounded border border-[rgba(229,106,92,0.35)] bg-[rgba(229,106,92,0.08)] p-3">
        <div className="mb-2 flex items-center gap-2 text-[12px] text-[var(--clay)]">
          <AlertTriangle className="h-3.5 w-3.5" />
          rclone engine not installed
        </div>
        <p className="mb-2.5 text-[11px] leading-5 text-[var(--muted)]">The sync engine is missing. Install it automatically — no setup needed.</p>
        <button
          className="btn-ember h-9 w-full"
          onClick={async () => {
            const result = await window.openObsidianSync.installRclone();
            setNotice(result.ok ? "rclone installed and ready." : result.error);
          }}
        >
          <CloudDownload className="h-3.5 w-3.5" />
          Download &amp; install rclone
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 flex items-center justify-between rounded border border-[var(--hairline-soft)] bg-[var(--obsidian)] px-2.5 py-1.5">
      <span className="eyebrow inline-flex items-center gap-1.5">
        <span className="dot status-synced" />
        rclone engine ready
      </span>
      <button
        className="mono text-[10.5px] uppercase tracking-wider text-[var(--faint)] hover:text-[var(--ember)]"
        title="Reinstall the latest rclone"
        onClick={async () => {
          const result = await window.openObsidianSync.installRclone();
          setNotice(result.ok ? "rclone is ready." : result.error);
        }}
      >
        reinstall
      </button>
    </div>
  );
}

function CreateRemote({
  setNotice,
  onCreated
}: {
  setNotice: (notice?: string, kind?: ToastKind) => void;
  onCreated?: (name: string) => void;
}) {
  const [type, setType] = useState("drive");
  const [customType, setCustomType] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [remotes, setRemotes] = useState<string[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  // crypt-only state
  const [baseRemote, setBaseRemote] = useState("");
  const [basePath, setBasePath] = useState("Obsidian");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  const nameEdited = useRef(false);
  const kind = remoteKinds.find((option) => option.type === type)!;

  const refresh = async () => {
    const result = await window.openObsidianSync.listRcloneRemotes();
    if (result.ok) setRemotes(result.value ?? []);
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Suggest a sensible default remote name per provider, until the user edits it.
  useEffect(() => {
    setFieldValues({});
    if (nameEdited.current) return;
    const suggested = type === "custom" ? "" : type === "protondrive" ? "proton" : type === "s3" ? "s3" : type === "onedrive" ? "onedrive" : type === "dropbox" ? "dropbox" : type === "crypt" ? "encrypted" : "gdrive";
    setName(suggested);
  }, [type]);

  const setField = (key: string, value: string) => setFieldValues((current) => ({ ...current, [key]: value }));

  const done = (remoteName: string) => {
    setNotice(`Remote "${remoteName}" created. It's now selectable when adding a vault.`, "success");
    void refresh();
    onCreated?.(remoteName);
  };

  const create = async () => {
    if (!name.trim()) return setNotice("Enter a name for this remote.");
    setBusy(true);
    try {
      if (kind.kind === "crypt") {
        if (!baseRemote || !pw) return setNotice("Encrypted remote needs a base remote and a password.");
        const result = await window.openObsidianSync.createCryptRemote({ name, baseRemote, basePath, password: pw, password2: pw2 || undefined });
        if (result.ok && result.value) {
          setPw("");
          setPw2("");
          done(result.value);
        } else setNotice(result.error);
        return;
      }

      if (kind.kind === "oauth") {
        setNotice(`Opening your browser to sign in to ${kind.label}…`, "info");
        const result = await window.openObsidianSync.createRemote({ name, type: kind.type });
        if (result.ok && result.value) done(result.value);
        else setNotice(result.error);
        return;
      }

      if (kind.kind === "fields") {
        const missing = (kind.fields ?? []).filter((field) => !field.optional && !fieldValues[field.key]?.trim());
        if (missing.length) return setNotice(`Fill in: ${missing.map((field) => field.label).join(", ")}.`);
        const options: Record<string, string> = {};
        for (const field of kind.fields ?? []) {
          const value = fieldValues[field.key]?.trim();
          if (value) options[field.key] = value;
        }
        const obscureKeys = (kind.fields ?? []).filter((field) => field.obscure).map((field) => field.key);
        const result = await window.openObsidianSync.createRemote({ name, type: kind.type, options, obscureKeys });
        if (result.ok && result.value) done(result.value);
        else setNotice(result.error);
        return;
      }

      // custom
      const realType = customType.trim();
      if (!realType) return setNotice("Enter the rclone backend type (e.g. b2, pcloud, sftp).");
      const result = await window.openObsidianSync.createRemote({ name, type: realType });
      if (result.ok && result.value) done(result.value);
      else setNotice(result.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <label className="label text-[12px]">
        <FieldLabel label="Provider" tip="Choose your cloud storage provider. Google Drive, Dropbox and OneDrive sign in through your browser; others ask for credentials here." />
        <select className="field h-9" value={type} onChange={(event) => setType(event.target.value)}>
          {remoteKinds.map((option) => (
            <option key={option.type} value={option.type}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {kind.note && <p className="text-[11px] leading-5 text-[var(--muted)]">{kind.note}</p>}

      <label className="label text-[12px]">
        <FieldLabel label="Remote name" tip="A short nickname for this connection (letters, numbers, - and _). You'll pick it when adding a vault." />
        <input
          className="field mono h-9 text-[12px]"
          placeholder="e.g. gdrive"
          value={name}
          onChange={(event) => {
            nameEdited.current = true;
            setName(event.target.value.replace(/[^a-zA-Z0-9_-]/g, ""));
          }}
        />
      </label>

      {kind.kind === "custom" && (
        <label className="label text-[12px]">
          <FieldLabel label="rclone backend type" tip="The rclone backend identifier, e.g. b2, pcloud, sftp, mega. See rclone.org/overview for the full list." />
          <input className="field mono h-9 text-[12px]" placeholder="b2, pcloud, sftp…" value={customType} onChange={(event) => setCustomType(event.target.value)} />
        </label>
      )}

      {kind.kind === "fields" &&
        (kind.fields ?? []).map((field) => (
          <label key={field.key} className="label text-[12px]">
            <FieldLabel label={field.optional ? `${field.label} (optional)` : field.label} tip={field.tip} />
            <input
              className="field h-9 text-[12px]"
              type={field.password ? "password" : "text"}
              placeholder={field.placeholder}
              value={fieldValues[field.key] ?? ""}
              onChange={(event) => setField(field.key, event.target.value)}
            />
          </label>
        ))}

      {kind.kind === "crypt" && (
        <>
          <label className="label text-[12px]">
            <FieldLabel label="Base remote" tip="An existing remote (created above) that the encrypted data is stored on. Create a normal remote first if the list is empty." />
            <select className="field h-9" value={baseRemote} onChange={(event) => setBaseRemote(event.target.value)}>
              <option value="">choose…</option>
              {remotes.map((remote) => (
                <option key={remote} value={remote}>
                  {remote}
                </option>
              ))}
            </select>
          </label>
          <label className="label text-[12px]">
            <FieldLabel label="Folder on base remote" tip="Subfolder on the base remote where the encrypted files live, e.g. Obsidian." />
            <input className="field mono h-9 text-[12px]" placeholder="Obsidian" value={basePath} onChange={(event) => setBasePath(event.target.value)} />
          </label>
          <label className="label text-[12px]">
            <FieldLabel label="Encryption password" tip="Used to encrypt/decrypt your files. Keep it safe — losing it means the encrypted files cannot be recovered." />
            <input className="field h-9" type="password" value={pw} onChange={(event) => setPw(event.target.value)} />
          </label>
          <label className="label text-[12px]">
            <FieldLabel label="Salt / password2 (optional)" tip="A second password (salt) for extra strength. Optional, but if set you must remember it too." />
            <input className="field h-9" type="password" value={pw2} onChange={(event) => setPw2(event.target.value)} />
          </label>
          <p className="text-[11px] leading-5 text-[var(--amber)]">⚠ Keep this password safe. Without it the encrypted files cannot be read.</p>
        </>
      )}

      <button className="btn-ember h-9 w-full" disabled={busy} onClick={() => void create()}>
        {kind.kind === "crypt" ? <Lock className="h-3.5 w-3.5" /> : <PlusCircle className="h-3.5 w-3.5" />}
        {busy ? "Working…" : kind.kind === "crypt" ? "Create encrypted remote" : `Connect ${kind.label.split(" / ")[0]}`}
      </button>

      {remotes.length > 0 && (
        <div className="pt-1">
          <div className="eyebrow mb-1.5">Connected remotes</div>
          <div className="flex flex-wrap gap-1.5">
            {remotes.map((remote) => (
              <span key={remote} className="chip">
                {remote}
                <button
                  title={`Delete ${remote}`}
                  onClick={async () => {
                    const result = await window.openObsidianSync.deleteRemote(remote);
                    setNotice(result.ok ? `Remote "${remote}" deleted.` : result.error);
                    void refresh();
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SecureBox({ appState, setNotice }: { appState: AppState; setNotice: (notice?: string) => void }) {
  const [password, setPassword] = useState("");

  return (
    <div className="space-y-2.5">
      <p className="text-[12px] leading-5 text-[var(--muted)]">
        Set an rclone config password so cloud tokens are encrypted at rest. Stored with OS secure storage and unlocked automatically.
      </p>
      <div className="flex items-center justify-between text-[11px]">
        <span className="eyebrow inline-flex items-center gap-1.5">
          <KeyRound className="h-3.5 w-3.5 text-[var(--ember)]" />
          Config password
        </span>
        <span className={`mono ${appState.rcloneConfigPasswordSet ? "text-[var(--jade)]" : "text-[var(--faint)]"}`}>
          {appState.rcloneConfigPasswordSet ? "● saved" : "○ not set"}
        </span>
      </div>
      <input
        className="field h-9"
        disabled={!appState.secureStorageAvailable}
        placeholder={appState.secureStorageAvailable ? "rclone config password" : "secure storage unavailable"}
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn h-9"
          disabled={!appState.secureStorageAvailable}
          onClick={async () => {
            const result = await window.openObsidianSync.setRcloneConfigPassword(password);
            setNotice(result.ok ? "Encrypted rclone config password saved." : result.error);
            if (result.ok) setPassword("");
          }}
        >
          Save
        </button>
        <button
          className="btn h-9"
          onClick={async () => {
            const result = await window.openObsidianSync.clearRcloneConfigPassword();
            setNotice(result.ok ? "Saved rclone config password cleared." : result.error);
            setPassword("");
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function BackupBox({ setNotice }: { setNotice: (notice?: string) => void }) {
  const [remote, setRemote] = useState("");
  const [remotePath, setRemotePath] = useState("OpenObsidianSync/settings-backup");
  const [remotes, setRemotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.openObsidianSync.listRcloneRemotes().then((result) => {
      if (result.ok) setRemotes(result.value ?? []);
    });
  }, []);

  const run = async (mode: "backup" | "restore") => {
    if (!remote) return setNotice("Choose a remote first.");
    setBusy(true);
    try {
      const input = { remote, remotePath };
      const result = mode === "backup" ? await window.openObsidianSync.backupSettings(input) : await window.openObsidianSync.restoreSettings(input);
      if (result.ok) setNotice(mode === "backup" ? `Settings backed up to ${result.value}.` : `Settings restored from ${result.value}.`);
      else setNotice(result.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <p className="text-[12px] leading-5 text-[var(--muted)]">
        Copy your vault list, options, and rclone config to a remote — restore them on another machine. Use an encrypted remote or config password to protect tokens.
      </p>
      <label className="label text-[12px]">
        <span className="eyebrow">Remote</span>
        <select className="field h-9" value={remote} onChange={(event) => setRemote(event.target.value)}>
          <option value="">choose…</option>
          {remotes.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <input className="field mono h-9 text-[12px]" value={remotePath} onChange={(event) => setRemotePath(event.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <button className="btn h-9" disabled={busy} onClick={() => void run("backup")}>
          <CloudUpload className="h-3.5 w-3.5" />
          Back up
        </button>
        <button className="btn h-9" disabled={busy} onClick={() => void run("restore")}>
          <CloudDownload className="h-3.5 w-3.5" />
          Restore
        </button>
      </div>
    </div>
  );
}

function AddVaultPanel({
  setNotice,
  onAdded,
  goToCloud
}: {
  setNotice: (notice?: string, kind?: ToastKind) => void;
  onAdded: () => void;
  goToCloud: () => void;
}) {
  const [input, setInput] = useState<AddVaultInput>({
    localPath: "",
    provider: "google-drive",
    remote: "",
    remotePath: "Obsidian/My Vault",
    includeObsidianConfig: true,
    selectiveSync: defaultSelectiveSync(),
    conflictStrategy: defaultConflictStrategy,
    excludePatterns: [".trash/**"],
    syncIntervalMinutes: 10,
    autoSync: true
  });
  const [remotes, setRemotes] = useState<string[]>([]);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof AddVaultInput>(key: K, value: AddVaultInput[K]) => setInput((current) => ({ ...current, [key]: value }));
  const setSelective = (key: keyof SelectiveSyncSettings, value: boolean) =>
    setInput((current) => ({ ...current, selectiveSync: { ...current.selectiveSync, [key]: value } }));

  const loadRemotes = async () => {
    const result = await window.openObsidianSync.listRcloneRemotes();
    if (result.ok) {
      setRemotes(result.value ?? []);
      setInput((current) => (current.remote || !(result.value ?? []).length ? current : { ...current, remote: result.value![0] }));
    }
  };
  useEffect(() => {
    void loadRemotes();
  }, []);

  const runScan = async () => {
    const result = await window.openObsidianSync.scanFolder();
    if (!result.ok || !result.value) return setNotice(result.error);
    setScan(result.value);
    const initial: Record<string, boolean> = {};
    result.value.candidates.forEach((candidate) => (initial[candidate.path] = !candidate.alreadyAdded));
    setPicked(initial);
  };

  const addScanned = async () => {
    if (!scan) return;
    const paths = scan.candidates.filter((candidate) => picked[candidate.path] && !candidate.alreadyAdded).map((candidate) => candidate.path);
    if (!paths.length) return setNotice("Select at least one new vault to add.");
    if (!input.remote) return setNotice("Choose a remote first, or connect one under Cloud.");
    setBusy(true);
    const result = await window.openObsidianSync.addScanned({
      paths,
      provider: input.provider,
      remote: input.remote,
      remotePathPrefix: "Obsidian",
      includeObsidianConfig: input.includeObsidianConfig,
      selectiveSync: input.selectiveSync,
      conflictStrategy: input.conflictStrategy,
      excludePatterns: input.excludePatterns,
      syncIntervalMinutes: input.syncIntervalMinutes,
      autoSync: input.autoSync
    });
    setBusy(false);
    if (result.ok) {
      setNotice(`Added ${result.value} vault(s). Select each and hit Resync once to start syncing.`, "success");
      setScan(null);
      onAdded();
    } else setNotice(result.error);
  };

  const pickedCount = scan ? scan.candidates.filter((candidate) => picked[candidate.path] && !candidate.alreadyAdded).length : 0;

  return (
    <div className="panel p-4">
      <SectionHead icon={<Plus />} title="Add vaults" note="Scan a folder to add every vault at once, or add a single vault below." />

      {/* ---- bulk scan ---- */}
      <div className="mb-4 rounded border border-[var(--hairline-soft)] bg-[var(--obsidian)] p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <FieldLabel
            label="Scan a folder"
            tip="Pick a parent folder (e.g. your Documents or a Vaults folder). Every sub-folder containing a .obsidian directory is detected and can be added in one go."
          />
        </div>
        <button className="btn h-9 w-full" onClick={() => void runScan()}>
          <FolderSearch className="h-4 w-4" />
          Scan folder for vaults
        </button>

        {scan && (
          <div className="mt-3 space-y-2">
            <div className="mono text-[10.5px] text-[var(--faint)]">
              {scan.candidates.length} found in {scan.baseDir}
            </div>
            <div className="max-h-44 space-y-1 overflow-auto">
              {scan.candidates.map((candidate) => (
                <label
                  key={candidate.path}
                  className={`flex items-center gap-2 rounded border px-2.5 py-2 text-[12px] ${
                    candidate.alreadyAdded ? "border-[var(--hairline-soft)] text-[var(--faint)]" : "border-[var(--hairline)] text-[var(--bone-dim)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-[var(--ember)]"
                    disabled={candidate.alreadyAdded}
                    checked={!!picked[candidate.path] && !candidate.alreadyAdded}
                    onChange={(event) => setPicked((current) => ({ ...current, [candidate.path]: event.target.checked }))}
                  />
                  <span className="min-w-0 flex-1 truncate" title={candidate.path}>
                    {candidate.name}
                  </span>
                  {candidate.alreadyAdded && <span className="mono text-[10px] text-[var(--jade)]">added</span>}
                </label>
              ))}
            </div>
            <p className="text-[11px] leading-5 text-[var(--muted)]">
              New vaults use the remote and options selected below. Each syncs to <span className="mono">Obsidian/&lt;vault name&gt;</span>.
            </p>
            <button className="btn-ember h-9 w-full" disabled={busy || pickedCount === 0} onClick={() => void addScanned()}>
              <Plus className="h-3.5 w-3.5" />
              {busy ? "Adding…" : `Add ${pickedCount} vault${pickedCount === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </div>

      <div className="mb-3 flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--hairline-soft)]" />
        <span className="eyebrow">or add one vault</span>
        <span className="h-px flex-1 bg-[var(--hairline-soft)]" />
      </div>

      <div className="space-y-3">
        <label className="label text-[12px]">
          <FieldLabel label="Local vault" tip="The folder on this computer that is your Obsidian vault (it contains a hidden .obsidian directory). Use the folder button to browse." />
          <div className="flex gap-2">
            <input className="field mono flex-1 text-[12px]" value={input.localPath} onChange={(event) => set("localPath", event.target.value)} placeholder="C:\Vaults\Notes" />
            <button
              className="icon-btn"
              title="Choose vault folder"
              onClick={async () => {
                const result = await window.openObsidianSync.chooseVault();
                if (result.ok && result.value) set("localPath", result.value);
                else setNotice(result.error);
              }}
            >
              <FolderOpen className="h-4 w-4" />
            </button>
          </div>
        </label>

        <label className="label text-[12px]">
          <FieldLabel label="Provider" tip="Which cloud service this vault syncs to. This is just a label; the actual connection is the remote you pick below." />
          <select className="field h-9" value={input.provider} onChange={(event) => set("provider", event.target.value as Provider)}>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>

        <label className="label text-[12px]">
          <FieldLabel label="rclone remote" tip="The connection used to reach your cloud. Create one under the Cloud tab first — Proton Drive, Google Drive, etc." />
          {remotes.length > 0 ? (
            <div className="flex gap-2">
              <select className="field h-9 flex-1" value={input.remote} onChange={(event) => set("remote", event.target.value)}>
                <option value="">choose a remote…</option>
                {remotes.map((remote) => (
                  <option key={remote} value={remote}>
                    {remote}
                  </option>
                ))}
              </select>
              <button className="icon-btn" title="Refresh remotes" onClick={() => void loadRemotes()}>
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button className="btn h-9 w-full" onClick={goToCloud}>
              <Cloud className="h-3.5 w-3.5" />
              No remotes yet — connect a cloud provider
            </button>
          )}
        </label>

        <label className="label text-[12px]">
          <FieldLabel label="Remote folder" tip="Path inside the remote where this vault is stored, e.g. Obsidian/My Vault. Created automatically if it doesn't exist." />
          <input className="field mono text-[12px]" value={input.remotePath} onChange={(event) => set("remotePath", event.target.value)} />
        </label>

        <label className="label text-[12px]">
          <FieldLabel label="Conflict strategy" tip="When the same file changed in both places, which copy wins. The losing copy is always kept as a .conflict file, never deleted." />
          <select className="field" value={input.conflictStrategy} onChange={(event) => set("conflictStrategy", event.target.value as ConflictStrategy)}>
            {conflictStrategyOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="label text-[12px]">
            <FieldLabel label="Interval (min)" tip="How often to auto-sync on a timer, in minutes, in addition to syncing when files change." />
            <input className="field mono" type="number" min={1} value={input.syncIntervalMinutes} onChange={(event) => set("syncIntervalMinutes", Number(event.target.value))} />
          </label>
          <label className="label text-[12px]">
            <FieldLabel label="Auto sync" tip="When on, the vault syncs automatically on file changes and on the timer. When off, you sync manually with the Sync button." />
            <select className="field" value={input.autoSync ? "yes" : "no"} onChange={(event) => set("autoSync", event.target.value === "yes")}>
              <option value="yes">On</option>
              <option value="no">Off</option>
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2.5 text-[13px] text-[var(--bone-dim)]">
          <input type="checkbox" className="accent-[var(--ember)]" checked={input.includeObsidianConfig} onChange={(event) => set("includeObsidianConfig", event.target.checked)} />
          Sync .obsidian settings
          <Tip text="Syncs your Obsidian settings, themes and plugins across devices — but skips the per-device window layout so open panes don't fight each other." />
        </label>

        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <FieldLabel label="Selective sync" tip="Uncheck a media type to keep those files out of the cloud (they stay local only). Handy to avoid syncing large videos." />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {selectiveSyncOptions.map((option) => (
              <label key={option.key} className="flex items-center gap-2 rounded border border-[var(--hairline-soft)] bg-[var(--obsidian)] px-2.5 py-2 text-[12px] text-[var(--bone-dim)]">
                <input type="checkbox" className="accent-[var(--ember)]" checked={input.selectiveSync[option.key]} onChange={(event) => setSelective(option.key, event.target.checked)} />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <label className="label text-[12px]">
          <FieldLabel label="Exclude patterns" tip="Glob patterns (one per line) for files/folders to never sync, e.g. .trash/** or **/*.tmp." />
          <textarea className="field mono min-h-20 resize-y text-[12px]" value={input.excludePatterns.join("\n")} onChange={(event) => set("excludePatterns", event.target.value.split(/\r?\n/))} />
        </label>

        <button
          className="btn-ember w-full"
          onClick={async () => {
            const result = await window.openObsidianSync.addVault(input);
            if (result.ok) {
              setNotice("Vault added. Hit Resync once to establish the bisync baseline.", "success");
              onAdded();
            } else setNotice(result.error);
          }}
        >
          <Plus className="h-4 w-4" />
          Add vault
        </button>
      </div>
    </div>
  );
}

function VaultSettings({ vault, setNotice }: { vault: VaultConfig; setNotice: (notice?: string) => void }) {
  const [draft, setDraft] = useState(vault);

  useEffect(() => setDraft(vault), [vault]);

  const set = <K extends keyof VaultConfig>(key: K, value: VaultConfig[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const setSelective = (key: keyof SelectiveSyncSettings, value: boolean) =>
    setDraft((current) => ({ ...current, selectiveSync: { ...current.selectiveSync, [key]: value } }));

  return (
    <div className="panel p-4">
      <SectionHead icon={<Settings />} title="Vault settings" note="Changing sync scope needs one Resync to rebuild the baseline." />

      <div className="space-y-3">
        <label className="label text-[12px]">
          <span className="eyebrow">Name</span>
          <input className="field" value={draft.name} onChange={(event) => set("name", event.target.value)} />
        </label>
        <label className="label text-[12px]">
          <span className="eyebrow">Remote</span>
          <input className="field mono text-[12px]" value={draft.remote} onChange={(event) => set("remote", event.target.value)} />
        </label>
        <label className="label text-[12px]">
          <span className="eyebrow">Remote folder</span>
          <input className="field mono text-[12px]" value={draft.remotePath} onChange={(event) => set("remotePath", event.target.value)} />
        </label>
        <label className="label text-[12px]">
          <span className="eyebrow">Conflict strategy</span>
          <select className="field" value={draft.conflictStrategy} onChange={(event) => set("conflictStrategy", event.target.value as ConflictStrategy)}>
            {conflictStrategyOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="label text-[12px]">
          <span className="eyebrow">Exclude patterns</span>
          <textarea className="field mono min-h-20 resize-y text-[12px]" value={draft.excludePatterns.join("\n")} onChange={(event) => set("excludePatterns", event.target.value.split(/\r?\n/))} />
        </label>
        <label className="flex items-center gap-2.5 text-[13px] text-[var(--bone-dim)]">
          <input type="checkbox" className="accent-[var(--ember)]" checked={draft.includeObsidianConfig} onChange={(event) => set("includeObsidianConfig", event.target.checked)} />
          Sync .obsidian settings except workspace layout
        </label>
        <div>
          <div className="eyebrow mb-2">Selective sync</div>
          <div className="grid grid-cols-2 gap-2">
            {selectiveSyncOptions.map((option) => (
              <label key={option.key} className="flex items-center gap-2 rounded border border-[var(--hairline-soft)] bg-[var(--obsidian)] px-2.5 py-2 text-[12px] text-[var(--bone-dim)]">
                <input type="checkbox" className="accent-[var(--ember)]" checked={draft.selectiveSync[option.key]} onChange={(event) => setSelective(option.key, event.target.checked)} />
                {option.label}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            className="btn-ember"
            onClick={async () => {
              const result = await window.openObsidianSync.updateVault(draft);
              setNotice(result.ok ? "Settings saved." : result.error);
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
            Save
          </button>
          <button
            className="btn-danger"
            onClick={async () => {
              const result = await window.openObsidianSync.removeVault(vault.id);
              setNotice(result.ok ? "Vault removed." : result.error);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

interface OnboardStep {
  eyebrow: string;
  title: string;
  body: JSX.Element;
  cta?: { label: string; action: () => void };
}

function OnboardingModal({
  appState,
  onGoto,
  onFinish
}: {
  appState: AppState;
  onGoto: (tab: PanelTab) => void;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(0);

  const steps: OnboardStep[] = [
    {
      eyebrow: "Welcome",
      title: "Your notes, your cloud, your keys.",
      body: (
        <p>
          Open Obsidian Sync keeps your Obsidian vaults in sync through cloud storage <b>you already own</b> — Google Drive,
          Dropbox, Proton Drive, and 70+ more. No subscription, no separate server. This quick tour sets you up in three steps.
        </p>
      )
    },
    {
      eyebrow: "Step 1 · Engine",
      title: "The sync engine installs itself.",
      body: (
        <div className="space-y-3">
          <p>
            Under the hood we use <b>rclone</b>, a trusted open-source tool. You don't need to install anything — the app
            downloads and verifies it automatically on first launch.
          </p>
          <div className="rounded border border-[var(--hairline)] bg-[var(--obsidian)] p-3">
            {appState.rcloneInstalling ? (
              <div className="flex items-center gap-2 text-[13px] text-[var(--ember)]">
                <RefreshCw className="h-4 w-4 animate-spin" /> Installing rclone… {appState.rcloneDownloadPercent ?? ""}
                {appState.rcloneDownloadPercent !== undefined ? "%" : ""}
              </div>
            ) : appState.rcloneAvailable ? (
              <div className="flex items-center gap-2 text-[13px] text-[var(--jade)]">
                <CheckCircle2 className="h-4 w-4" /> Sync engine ready.
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[13px] text-[var(--clay)]">
                <AlertTriangle className="h-4 w-4" /> Not installed yet — it'll download automatically, or trigger it in Cloud
                setup.
              </div>
            )}
          </div>
        </div>
      )
    },
    {
      eyebrow: "Step 2 · Connect",
      title: "Connect your cloud.",
      body: (
        <p>
          Open the <b>Cloud</b> tab and create a remote. Google Drive, Dropbox and OneDrive open your browser to sign in;
          Proton Drive and S3 ask for credentials right in the app. Want zero-knowledge privacy? Add an <b>Encrypted (crypt)</b>{" "}
          remote so your provider only ever sees ciphertext.
        </p>
      ),
      cta: {
        label: "Open Cloud setup",
        action: () => {
          onGoto("cloud");
          onFinish();
        }
      }
    },
    {
      eyebrow: "Step 3 · Add vaults",
      title: "Add one vault — or a whole folder.",
      body: (
        <p>
          In the <b>Add</b> tab, browse to a single vault, or use <b>Scan folder for vaults</b> to point at a parent folder and
          add every vault inside it at once. Pick your remote, then hit <b>Resync</b> once to establish the baseline. After that
          it syncs automatically. Hover any <HelpCircle className="inline h-3.5 w-3.5 text-[var(--ember)]" /> for help on a
          setting.
        </p>
      ),
      cta: {
        label: "Add my vaults",
        action: () => {
          onGoto("add");
          onFinish();
        }
      }
    }
  ];

  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-body">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FacetMark size={30} />
              <span className="eyebrow">{current.eyebrow}</span>
            </div>
            <button className="toast-close" title="Skip tour" onClick={onFinish}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <Shimmer as="h2" className="display mb-3 block text-[24px] text-[var(--bone)]">
            {current.title}
          </Shimmer>
          <div className="text-[14px] leading-6 text-[var(--bone-dim)]">{current.body}</div>

          <div className="mt-7 flex items-center justify-between">
            <div className="modal-dots">
              {steps.map((_, index) => (
                <span key={index} className="modal-dot" data-on={index === step} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button className="btn h-9" onClick={() => setStep((value) => value - 1)}>
                  Back
                </button>
              )}
              {current.cta && (
                <button className="btn h-9" onClick={current.cta.action}>
                  {current.cta.label}
                </button>
              )}
              {last ? (
                <button className="btn-ember h-9" onClick={onFinish}>
                  <Sparkles className="h-4 w-4" />
                  Done
                </button>
              ) : (
                <button className="btn-ember h-9" onClick={() => setStep((value) => value + 1)}>
                  Next
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="grid h-full place-items-center">
      <div className="max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <FacetMark size={72} />
        </div>
        <div className="eyebrow mb-3">No vault selected</div>
        <Shimmer as="h2" className="display mb-3 block text-[26px] text-[var(--bone)]">Your notes, your cloud, your keys.</Shimmer>
        <p className="mx-auto mb-6 max-w-sm text-[14px] leading-6 text-[var(--muted)]">
          Connect Google Drive, Dropbox, Proton Drive, or any of rclone&apos;s 70+ backends — with optional end-to-end encryption. Everything is set up right here in the app.
        </p>
        <button className="btn-ember mx-auto" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add your first vault
        </button>
      </div>
    </div>
  );
}
