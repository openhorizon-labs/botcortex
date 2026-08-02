"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/** three.js is browser-only; ssr:false keeps the landing/server clean. */
const SimView = dynamic(() => import("@/components/app/sim-view"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      loading simulation…
    </div>
  ),
});
import {
  ArrowRight,
  ArrowUp,
  Blocks,
  Bot,
  Box,
  Brain,
  CalendarClock,
  ChevronDown,
  ChevronsUpDown,
  CircleHelp,
  FolderCode,
  Hand,
  Layers,
  LogIn,
  LogOut,
  Play,
  Plus,
  Search,
  ScrollText,
  Settings,
  ShieldCheck,
  Shuffle,
  SlashSquare,
  SquarePen,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { LiveDot } from "@/components/kit/live-dot";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { authClient, useSession } from "@/lib/auth-client";

const SKILLS = ["wave_right_arm", "pick_and_place", "fold_towel"];

const ROBOT_PAGES = [
  { icon: Brain, label: "Memory" },
  { icon: FolderCode, label: "Policies" },
  { icon: CalendarClock, label: "Scheduled tasks" },
  { icon: ScrollText, label: "Logs" },
];

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
  const [simOpen, setSimOpen] = useState(true);
  const { data: session } = useSession();

  useEffect(() => {
    const saved = localStorage.getItem("botcortex.simOpen");
    if (saved !== null) setSimOpen(saved === "true");
  }, []);

  function toggleSim() {
    setSimOpen((open) => {
      localStorage.setItem("botcortex.simOpen", String(!open));
      return !open;
    });
  }

  const { status, robot, skills, activity, lastChat, sendChat, runSkill, stop } =
    useRobot();
  const connected = status === "connected";
  const skillList = skills ?? SKILLS;

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
                  <SidebarMenuButton className="font-medium">
                    <span className="flex size-[18px] shrink-0 items-center justify-center rounded bg-foreground text-[10px] font-medium text-background">
                      B
                    </span>
                    OpenArm v1
                    <ChevronsUpDown className="ml-auto size-3.5 text-muted-foreground" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Robots
                  </DropdownMenuLabel>
                  <DropdownMenuItem>
                    <Bot className="size-4" />{" "}
                    {robot ? `${robot.name} · ${robot.platform}` : "OpenArm v1 · Thor"}
                  </DropdownMenuItem>
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
                  <SidebarMenuButton
                    isActive
                    className="data-[active=true]:border data-[active=true]:border-border data-[active=true]:bg-background"
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
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Blocks /> Marketplace
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Tasks</SidebarGroupLabel>
            <SidebarGroupContent>
              <p className="px-2 py-1 text-sm text-muted-foreground">
                No tasks yet
              </p>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Robot</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ROBOT_PAGES.map(({ icon: Icon, label }) => (
                  <SidebarMenuItem key={label}>
                    <SidebarMenuButton>
                      <Icon /> {label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
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
                {skillList.map((s) => (
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
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <CircleHelp /> Help
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <Settings /> Settings
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

      <SidebarInset className="overflow-y-auto rounded-lg border border-border shadow-none">
        <header className="flex h-12 shrink-0 items-center justify-between px-3">
          <SidebarTrigger className="text-muted-foreground" />
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSim}
                  className={cn(
                    "size-7",
                    simOpen ? "text-foreground" : "text-muted-foreground",
                  )}
                  aria-label="Toggle simulation view"
                  aria-pressed={simOpen}
                >
                  <Box className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {simOpen ? "Hide" : "Show"} the simulation view
              </TooltipContent>
            </Tooltip>
            <button onClick={() => setConnectOpen(true)} aria-label="Connection">
              <Badge
                variant="outline"
                className="h-6 gap-1.5 rounded-full px-2.5 text-xs font-normal text-muted-foreground transition-colors hover:text-foreground"
              >
                {connected ? (
                  <>
                    <LiveDot />
                    {robot?.name ?? "robot"} · {activity}
                  </>
                ) : status === "connecting" ? (
                  <>
                    <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
                    connecting…
                  </>
                ) : (
                  <>
                    <span className="size-1.5 rounded-full bg-muted-foreground" />
                    no robot connected
                  </>
                )}
              </Badge>
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!connected}
                  onClick={() => stop()}
                  className="h-7 bg-destructive px-3 text-xs font-semibold tracking-wide text-white hover:bg-destructive/90"
                >
                  STOP
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {connected
                  ? "Emergency stop — aborts motion between interpolation steps"
                  : "Connect a robot first — STOP goes straight to its REST endpoint"}
              </TooltipContent>
            </Tooltip>
          </div>
        </header>

        <div
          className={cn(
            "mx-auto flex w-full max-w-[768px] flex-1 flex-col px-4",
            simOpen ? "pt-4" : "pt-[22vh]",
          )}
        >
          {simOpen ? (
            <div className="h-[380px] shrink-0 overflow-hidden rounded-[16px] border border-border bg-surface-2">
              <SimView />
            </div>
          ) : (
            <h1 className="text-center text-[30px] font-normal tracking-[-0.01em]">
              What should the robot learn today?
            </h1>
          )}

          {/* Composer — off-white panel on the white card, radius 16. */}
          <div className="mt-7 rounded-[16px] border border-border bg-surface-2 transition-colors focus-within:border-border-strong">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder='Teach it: "sort the red parts into the left bin"'
              className="min-h-9 resize-none border-0 bg-transparent px-4 pt-3.5 text-[15px] shadow-none focus-visible:ring-0"
              rows={1}
            />
            <div className="flex items-center justify-between px-2.5 pb-2 pt-1">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  aria-label="Add context"
                >
                  <Plus className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  aria-label="Commands"
                >
                  <SlashSquare className="size-4" />
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setDryRun((d) => !d)}
                      className={cn(
                        "ml-1 flex h-6 items-center gap-1 rounded-full px-2.5 text-xs transition-colors",
                        dryRun
                          ? "border border-border bg-background text-muted-foreground hover:text-foreground"
                          : "bg-primary text-primary-foreground",
                      )}
                      aria-pressed={!dryRun}
                    >
                      {dryRun ? (
                        <ShieldCheck className="size-3" />
                      ) : (
                        <Zap className="size-3" />
                      )}
                      {dryRun ? "Dry run" : "Execute"}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Dry run previews every step without moving the arms. Real
                    execution needs an operator present.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Button
                size="icon"
                disabled={!input.trim()}
                onClick={handleSend}
                className="size-7 rounded-full"
                aria-label="Send"
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>
          </div>

          {lastChat && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm">
              <Bot className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>{lastChat}</span>
            </div>
          )}

          {/* Suggested tasks */}
          <Collapsible
            open={suggestedOpen}
            onOpenChange={setSuggestedOpen}
            className="mt-12"
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

          <p className="mt-auto pb-4 text-center text-xs text-muted-foreground/70">
            Skills run locally on the robot — the AI is only in the loop while
            teaching.
          </p>
        </div>
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
            {ROBOT_PAGES.map(({ icon: Icon, label }) => (
              <CommandItem key={label} onSelect={() => setCmdOpen(false)}>
                <Icon /> {label}
              </CommandItem>
            ))}
            <CommandItem onSelect={() => setCmdOpen(false)}>
              <Blocks /> Marketplace
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() => {
                setInput("");
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

      <ConnectRobotDialog open={connectOpen} onOpenChange={setConnectOpen} />
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
