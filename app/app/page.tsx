"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Blocks,
  Bot,
  ChevronDown,
  ChevronsUpDown,
  Hand,
  KeyRound,
  Layers,
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
import { RobotProvider, useRobot } from "@/components/app/robot-provider";
import { ConnectRobotDialog } from "@/components/app/connect-robot-dialog";
import { RobotKeysDialog } from "@/components/app/robot-keys-dialog";
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

const SUGGESTED = [
  { icon: Hand, label: "Wave the right arm" },
  { icon: Layers, label: "Pick from tray A, place in tray B" },
  { icon: Blocks, label: "Sort the blocks by color into bins" },
  { icon: Bot, label: "Fold the towel with both arms" },
];

function AppInner() {
  const [input, setInput] = useState("");
  const [suggestedOpen, setSuggestedOpen] = useState(true);
  const [dryRun, setDryRun] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const { data: session } = useSession();

  const toggleSim = () => setSimOpen((open) => !open);

  const {
    status, robot, skills, activity, messages, sendChat, runSkill, connect, host,
    conversations, conversationId, newConversation, openConversation, deleteConversation,
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
  const skillList = skills ?? [];

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    if (!connected) {
      setConnectOpen(true);
      return;
    }
    if (sendChat(text, dryRun)) setInput("");
  }

  function handleRunSkill(name: string) {
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
      <SidebarProvider
        className="bg-sidebar"
        style={{ "--sidebar-width": "248px" } as React.CSSProperties}
      >
      <Sidebar variant="inset" collapsible="offcanvas">
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
                    onClick={() => void newConversation()}
                    className="cursor-pointer"
                  >
                    <SquarePen /> New task
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setCmdOpen(true)}>
                    <Search /> Search
                  </SidebarMenuButton>
                  <SidebarMenuBadge className="text-muted-foreground">
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
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    Nothing yet — describe a task below.
                  </p>
                ) : (
                  conversations.map((thread) => (
                    <SidebarMenuItem key={thread.id}>
                      <SidebarMenuButton
                        isActive={thread.id === conversationId}
                        onClick={() => void openConversation(thread.id)}
                        className="cursor-pointer data-[active=true]:border data-[active=true]:border-border data-[active=true]:bg-background"
                      >
                        <span className="truncate">{thread.title ?? "Untitled task"}</span>
                      </SidebarMenuButton>
                      <SidebarMenuAction
                        showOnHover
                        aria-label={`Delete ${thread.title ?? "task"}`}
                        onClick={() => void deleteConversation(thread.id)}
                        className="cursor-pointer hover:text-destructive"
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
                <SidebarGroupAction aria-label="Teach a new skill">
                  <Plus />
                </SidebarGroupAction>
              </TooltipTrigger>
              <TooltipContent>Teach a new skill</TooltipContent>
            </Tooltip>
            <SidebarGroupContent>
              <SidebarMenu>
                {skillList.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    {connected
                      ? "Nothing learned yet — describe a task below."
                      : "Connect a robot to see its skills."}
                  </p>
                ) : (
                  skillList.map((s) => (
                    <SidebarMenuItem key={s}>
                      <SidebarMenuButton>{s}</SidebarMenuButton>
                      <SidebarMenuAction
                        showOnHover
                        aria-label={`Run ${s}`}
                        onClick={() => handleRunSkill(s)}
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
              <SidebarMenuButton
                onClick={() => setKeysOpen(true)}
                className="cursor-pointer"
              >
                <KeyRound /> Robot keys
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              {session ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      size="lg"
                      className="data-[state=open]:bg-surface-3"
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
              />
              <p className="shrink-0 pt-3 text-center text-xs text-muted-foreground/70">
                Skills run locally on the robot — the AI is only in the loop
                while teaching.
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
                  <button className="flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                    Shuffle <Shuffle className="size-3.5" />
                  </button>
                </div>
                <CollapsibleContent>
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    {SUGGESTED.map(({ icon: Icon, label }) => (
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
        onOpenChange={setCmdOpen}
        title="Search"
        description="Search skills, pages, and actions"
      >
        <Command>
        <CommandInput placeholder="Search skills, pages, actions…" />
        <CommandList>
          <CommandEmpty>Nothing found.</CommandEmpty>
          <CommandGroup heading="Skills">
            {skillList.map((s) => (
              <CommandItem
                key={s}
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
                setKeysOpen(true);
                setCmdOpen(false);
              }}
            >
              <KeyRound /> Robot keys
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
                void newConversation();
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
      <RobotKeysDialog open={keysOpen} onOpenChange={setKeysOpen} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

export default function Page() {
  return (
    <RobotProvider>
      <AppInner />
    </RobotProvider>
  );
}
