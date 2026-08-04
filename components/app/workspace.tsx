"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Blocks,
  Bot,
  ChevronDown,
  ChevronsUpDown,
  Coins,
  Hand,
  Settings,
  Layers,
  MessageSquare,
  LogIn,
  LogOut,
  PanelRight,
  Play,
  Plus,
  Search,
  SquarePen,
  ShieldCheck,
  Shuffle,
  Trash2,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useRobot } from "@/components/app/robot-provider";
import { ConnectRobotDialog } from "@/components/app/connect-robot-dialog";
import { SettingsDialog } from "@/components/app/settings-dialog";
import { ChatPane } from "@/components/app/chat-pane";
import { Composer } from "@/components/app/composer";
import { StopControl } from "@/components/app/stop-control";
import { SimPanel } from "@/components/app/sim-panel";
import { LiveDot } from "@/components/kit/live-dot";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { authClient, useSession } from "@/lib/auth-client";

type PairedRobot = {
  id: string;
  name: string;
  platform: string;
  address: string | null;
};

/**
 * Tasks the robot can actually attempt.
 *
 * Half of these used to be impossible. There is no towel to fold and no "tray
 * A" — the workcell has `tray_right`, `tray_left` and three named blocks — so
 * a new owner's most likely first click was a task that could not succeed, and
 * they paid credit to find out. Every entry below names something that exists
 * in the scene the robot reports.
 */
const SUGGESTED = [
  { icon: Blocks, label: "Put the red block in the right tray" },
  { icon: Layers, label: "Move the blue block next to the red one" },
  { icon: Hand, label: "Wave the right arm" },
  { icon: Bot, label: "Open and close the right gripper twice" },
  { icon: Blocks, label: "Put the green block in the left tray" },
  { icon: Layers, label: "Line the three blocks up in a row" },
  { icon: Hand, label: "Raise both arms together, slowly" },
  { icon: Bot, label: "Hold the red block up, then put it back" },
];

/** How many of them the panel shows at once. */
const SUGGESTED_SHOWN = 4;

function AppInner() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [suggestedOpen, setSuggestedOpen] = useState(true);
  const [suggestedFrom, setSuggestedFrom] = useState(0);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data: session } = useSession();

  const toggleSim = () => setSimOpen((open) => !open);

  const {
    status, robot, skills, activity, messages, sendChat, runSkill, connect, host,
    conversations, conversationId, newConversation, openConversation, deleteConversation,
    credit,
    stopped,
    pairing,
    // Session-scoped so the navigation the first message triggers doesn't
    // reset them out from under the owner.
    simOpen, setSimOpen, dryRun, setDryRun, model, setModel,
  } = useRobot();
  const [paired, setPaired] = useState<PairedRobot[]>([]);

  // The robots this account has paired via `botcortex login`. Listing the real
  // ones replaces a dropdown that used to show a hardcoded name whether or not
  // any robot existed.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/robots")
      .then((r) => (r.ok ? r.json() : { robots: [] }))
      .then((d) => {
        if (!cancelled) setPaired(d.robots ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const hasMessages = messages.length > 0;
  const connected = status === "connected";
  const busy =
    activity.startsWith("teaching") || activity.startsWith("running");
  const skillList = skills ?? [];

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    if (!connected) {
      setConnectOpen(true);
      return;
    }
    // A teach with the e-stop latched authors a skill and then cannot run it,
    // so the owner pays for something that was never verified. The banner is
    // right there; refusing here is what makes it mean something.
    if (stopped) return;
    if (sendChat(text, dryRun, model)) setInput("");
  }

  function handleRunSkill(name: string) {
    // The runtime refuses this too — that is the real guard, since a second
    // tab can send it. Here it just stops the button lying about what will
    // happen.
    if (busy) return;
    if (connected) runSkill(name, dryRun);
    else setInput(`Run ${name}`);
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <TooltipProvider>
      {/* h-svh, not the provider's default min-h-svh. "At least a viewport"
          lets the shell grow with the transcript, so flex-1 below resolves
          against content and the chat pane never scrolls — the whole PAGE
          does instead. Pinning the height is what makes the inner scroller
          engage. */}
      <SidebarProvider
        className="h-svh overflow-hidden bg-sidebar"
        style={{ "--sidebar-width": "248px" } as React.CSSProperties}
      >
      {/* icon, not offcanvas: collapsing leaves a rail of icons rather than
          sweeping the whole sidebar away. Every button below therefore needs an
          icon AND a tooltip, or the rail shows blank rows. */}
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" className="font-medium">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground text-[11px] font-medium text-background">
                      B
                    </span>
                    <div className="grid flex-1 leading-tight">
                      <span className="truncate text-sm">
                        {robot?.name ?? "No robot"}
                      </span>
                      <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        {connected ? (
                          <>
                            <LiveDot />
                            {activity}
                          </>
                        ) : status === "connecting" ? (
                          <>
                            <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
                            connecting…
                          </>
                        ) : (
                          <>
                            <span className="size-1.5 rounded-full bg-muted-foreground" />
                            not connected
                          </>
                        )}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-3.5 text-muted-foreground" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Robots
                  </DropdownMenuLabel>
                  {paired.length === 0 ? (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                      None paired yet — run{" "}
                      <code className="font-mono">botcortex login</code> on your
                      robot.
                    </p>
                  ) : (
                    paired.map((r) => (
                      <DropdownMenuItem
                        key={r.id}
                        className="cursor-pointer"
                        disabled={!r.address}
                        onSelect={() => r.address && connect(r.address)}
                      >
                        <Bot className="size-4" />
                        <span className="min-w-0 flex-1 truncate">
                          {r.name} · {r.platform}
                        </span>
                        {r.address && host === r.address && <LiveDot />}
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setConnectOpen(true)}>
                    <Plus className="size-4" /> Connect a robot
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  {/* Earns its place again now the transcript persists: this
                      wipes it and starts fresh, instead of no-opping. */}
                  <SidebarMenuButton
                    onClick={() => router.push("/app")}
                    tooltip="New task"
                    className="cursor-pointer"
                  >
                    <SquarePen /> New task
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setCmdOpen(true)}
                    tooltip="Search"
                    className="cursor-pointer"
                  >
                    <Search /> Search
                  </SidebarMenuButton>
                  {/* Hidden on the rail: a bare "⌘K" beside an icon reads as noise. */}
                  <SidebarMenuBadge className="text-muted-foreground group-data-[collapsible=icon]:hidden">
                    ⌘K
                  </SidebarMenuBadge>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Tasks</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {conversations.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                    Nothing yet — describe a task below.
                  </p>
                ) : (
                  conversations.map((thread) => (
                    <SidebarMenuItem key={thread.id}>
                      <SidebarMenuButton
                        isActive={thread.id === conversationId}
                        onClick={() => router.push(`/app/tasks/${thread.id}`)}
                        tooltip={thread.title ?? "Untitled task"}
                        className="cursor-pointer data-[active=true]:border data-[active=true]:border-border data-[active=true]:bg-background"
                      >
                        <MessageSquare />
                        <span className="truncate">{thread.title ?? "Untitled task"}</span>
                      </SidebarMenuButton>
                      <SidebarMenuAction
                        showOnHover
                        aria-label={`Delete ${thread.title ?? "task"}`}
                        onClick={() => void deleteConversation(thread.id)}
                        className="cursor-pointer hover:text-destructive group-data-[collapsible=icon]:hidden"
                      >
                        <Trash2 />
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Skills</SidebarGroupLabel>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Did nothing at all. Teaching a skill IS describing a task,
                    so it opens a fresh one and puts the cursor where the
                    describing happens. */}
                <SidebarGroupAction
                  aria-label="Teach a new skill"
                  onClick={() => {
                    router.push("/app");
                    requestAnimationFrame(() =>
                      document.querySelector("textarea")?.focus(),
                    );
                  }}
                >
                  <Plus />
                </SidebarGroupAction>
              </TooltipTrigger>
              <TooltipContent>Teach a new skill</TooltipContent>
            </Tooltip>
            <SidebarGroupContent>
              <SidebarMenu>
                {skillList.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                    {connected
                      ? "Nothing learned yet — describe a task below."
                      : "Connect a robot to see its skills."}
                  </p>
                ) : (
                  skillList.map((s) => (
                    <SidebarMenuItem key={s}>
                      {/* The row itself runs the skill. It looked clickable,
                          had a pointer cursor, and did nothing — the only way
                          to run one was a hover-revealed arrow most people
                          never found. */}
                      <SidebarMenuButton
                        tooltip={busy ? `${s} — robot busy` : `Run ${s}`}
                        onClick={() => handleRunSkill(s)}
                        className={cn("cursor-pointer", busy && "opacity-50")}
                      >
                        <Wrench />
                        <span className="truncate">{s}</span>
                      </SidebarMenuButton>
                      <SidebarMenuAction
                        showOnHover
                        aria-label={busy ? `${s} — robot busy` : `Run ${s}`}
                        onClick={() => handleRunSkill(s)}
                        className={cn(
                          "group-data-[collapsible=icon]:hidden",
                          busy
                            ? "cursor-not-allowed opacity-40"
                            : "cursor-pointer",
                        )}
                      >
                        <Play />
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              {/* A readout, not a control. It sat next to Settings and opened
                  the same dialog on the same default tab, so two adjacent
                  rows did the identical thing — asChild keeps the rail sizing
                  and the collapsed tooltip without pretending to be a button.

                  The BALANCE is hidden unless the connected robot can actually
                  spend it. A robot teaching on its owner's own provider key
                  leaves this figure frozen at full no matter how much work it
                  does, and a correct-looking number that never moves is worse
                  than no number — it is what sent an afternoon into debugging
                  a billing system that was working. The figure stays one click
                  away in Settings → Credit, where it is the account's, not a
                  claim about this robot. */}
              <SidebarMenuButton
                asChild
                // Also the ONLY way to read your balance in the collapsed
                // rail, where the figure itself is hidden — without it the
                // icon was mute.
                tooltip={
                  pairing === "half"
                    ? "This robot has no key — run `botcortex login` on it"
                    : pairing === "byo"
                      ? "This robot teaches on its own provider key — credit is not spent"
                      : credit
                        ? `${credit.spentDisplay} used of ${credit.grantedDisplay} · ${credit.display} left`
                        : "Credit"
                }
                className="cursor-default hover:bg-transparent active:translate-y-0"
              >
                <div>
                  <Coins />
                  <span className="flex-1 truncate">Credit</span>
                  {/* used / total, not what is left. Consumption is the thing
                      an owner is actually tracking, and a fraction moves
                      visibly against a fixed denominator where a lone
                      remaining figure just drifts down. The balance itself
                      sits in the composer, beside the send button. */}
                  <span className="font-mono text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                    {pairing === "half"
                      ? "not paired"
                      : pairing === "byo"
                        ? "own key"
                        : credit
                          ? `${credit.usedDisplay} / ${credit.grantedDisplay}`
                          : "—"}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setSettingsOpen(true)}
                tooltip="Settings"
                className="cursor-pointer"
              >
                <Settings /> Settings
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              {session ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      size="lg"
                      tooltip={session.user.email}
                      className="cursor-pointer data-[state=open]:bg-surface-3"
                    >
                      <Avatar className="size-7 rounded-lg">
                        <AvatarFallback className="rounded-lg bg-foreground text-xs font-medium text-background">
                          {(session.user.name || session.user.email)[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left leading-tight">
                        <span className="truncate text-sm font-medium">
                          {session.user.name || "Owner"}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {session.user.email}
                        </span>
                      </div>
                      <ChevronsUpDown className="ml-auto size-3.5 text-muted-foreground" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" className="w-56">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      Signed in as {session.user.email}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={async () => {
                        await authClient.signOut();
                        window.location.href = "/signin";
                      }}
                    >
                      <LogOut className="size-4" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <SidebarMenuButton onClick={() => (window.location.href = "/signin")}>
                  <LogIn /> Sign in
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-0 flex-row overflow-hidden rounded-lg border border-border shadow-none">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between px-3">
          <SidebarTrigger className="text-muted-foreground" />
          <div className="flex items-center gap-3">
            {!simOpen && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleSim}
                    className="size-7 text-muted-foreground"
                    aria-label="Show the simulation"
                  >
                    <PanelRight className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Show the simulation</TooltipContent>
              </Tooltip>
            )}
          </div>
        </header>

        <div className="mx-auto flex min-h-0 w-full max-w-[768px] flex-1 flex-col px-4 pb-3">
          {hasMessages ? (
            <>
              <ChatPane />
              <Composer
                className="mt-3 shrink-0"
                value={input}
                onChange={setInput}
                onSend={handleSend}
                dryRun={dryRun}
                onDryRunChange={setDryRun}
                model={model}
                onModelChange={setModel}
              />
              {/* Refusing silently reads as a broken send button, so the
                  footer says why — and points at the control that undoes it. */}
              <p className="shrink-0 pt-3 text-center text-xs text-muted-foreground/70">
                {stopped
                  ? "The e-stop is latched — clear it with STOP before teaching anything new."
                  : "Skills run locally on the robot — the AI is only in the loop while teaching."}
              </p>
            </>
          ) : (
            /* Empty state: greeting + composer + suggestions as one block,
               vertically centered — the sim.ai workspace shape. */
            <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto py-8">
              <h1 className="text-center text-[30px] font-normal tracking-[-0.01em]">
                What should the robot learn today?
              </h1>
              <Composer
                className="mt-7"
                value={input}
                onChange={setInput}
                onSend={handleSend}
                dryRun={dryRun}
                onDryRunChange={setDryRun}
                model={model}
                onModelChange={setModel}
              />

              <Collapsible
                open={suggestedOpen}
                onOpenChange={setSuggestedOpen}
                className="mt-8"
              >
                <div className="flex items-center justify-between px-1">
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                      Suggested tasks
                      <ChevronDown
                        className={cn(
                          "size-3.5 transition-transform",
                          !suggestedOpen && "-rotate-90",
                        )}
                      />
                    </button>
                  </CollapsibleTrigger>
                  {/* This used to be inert: clicking it four times gave the
                      same four ideas in the same order. There were only ever
                      four to draw from, so it now has a pool to rotate. */}
                  <button
                    onClick={() => setSuggestedFrom((n) => n + SUGGESTED_SHOWN)}
                    className="flex cursor-pointer items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Shuffle <Shuffle className="size-3.5" />
                  </button>
                </div>
                <CollapsibleContent>
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    {Array.from({ length: SUGGESTED_SHOWN }, (_, i) => SUGGESTED[
                      (suggestedFrom + i) % SUGGESTED.length
                    ]).map(({ icon: Icon, label }) => (
                      <button
                        key={label}
                        onClick={() => setInput(label)}
                        className="group flex h-9 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors hover:bg-surface-2"
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{label}</span>
                        <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
        </div>
        <SimPanel open={simOpen} onClose={toggleSim} />
      </SidebarInset>

      {/* ⌘K palette — real Command component over skills, pages, and actions. */}
      <CommandDialog
        open={cmdOpen}
        onOpenChange={(open) => {
          setCmdOpen(open);
          // Escape used to close the palette with the query still in it, so
          // reopening and typing appended to the old one — "wave armwave".
          if (!open) setQuery("");
        }}
        title="Search"
        description="Search tasks, skills, pages, and actions"
      >
        <Command>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search tasks, skills, actions…"
        />
        <CommandList>
          <CommandEmpty>Nothing found.</CommandEmpty>
          {/* Tasks, first — searching "wave" and being told "Nothing found."
              while a task named "wave arm twice" sits in the sidebar is the
              search failing at the only job anyone opens it for. */}
          {conversations.length > 0 && (
            <>
              <CommandGroup heading="Tasks">
                {conversations.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`task ${c.title ?? "Untitled task"}`}
                    onSelect={() => {
                      router.push(`/app/tasks/${c.id}`);
                      setCmdOpen(false);
                    }}
                  >
                    <MessageSquare /> {c.title ?? "Untitled task"}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}
          <CommandGroup heading="Skills">
            {skillList.map((s) => (
              <CommandItem
                key={s}
                disabled={busy}
                onSelect={() => {
                  handleRunSkill(s);
                  setCmdOpen(false);
                }}
              >
                <Play /> {s}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Robot">
            <CommandItem
              onSelect={() => {
                setConnectOpen(true);
                setCmdOpen(false);
              }}
            >
              <Plus /> Connect a robot
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setSettingsOpen(true);
                setCmdOpen(false);
              }}
            >
              <Settings /> Settings
            </CommandItem>
            <CommandItem
              onSelect={() => {
                toggleSim();
                setCmdOpen(false);
              }}
            >
              <PanelRight /> Toggle the simulation
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() => {
                router.push("/app");
                setCmdOpen(false);
              }}
            >
              <SquarePen /> New task
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setDryRun((d) => !d);
                setCmdOpen(false);
              }}
            >
              <ShieldCheck /> Toggle dry run
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setCmdOpen(false);
                setConnectOpen(true);
              }}
            >
              <Plus /> Connect a robot
            </CommandItem>
          </CommandGroup>
        </CommandList>
        </Command>
      </CommandDialog>

      <StopControl />
      <ConnectRobotDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

/**
 * The control room. /app is a fresh task; /app/tasks/[id] is an existing one.
 *
 * The provider lives in the layout ABOVE this, so moving between those two
 * keeps the socket and the transcript. All this does is keep the URL and the
 * open task pointing at each other.
 */
export function Workspace({ conversationId }: { conversationId?: string }) {
  const { conversationId: open, openConversation, newConversation } = useRobot();

  // URL -> state.
  useEffect(() => {
    if (conversationId) {
      if (conversationId !== open) void openConversation(conversationId);
    } else if (open) {
      // Landing on /app means starting fresh, not showing the last task.
      void newConversation();
    }
    // Only the URL drives this; reacting to `open` too would fight the effect
    // below and bounce between the two.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Giving a new task its URL is the provider's job — it outlives this
  // component across route segments, which this does not.

  return <AppInner />;
}
