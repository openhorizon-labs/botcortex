"use client";

import { useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  Blocks,
  Bot,
  Brain,
  CalendarClock,
  ChevronDown,
  ChevronsUpDown,
  CircleHelp,
  FolderCode,
  Hand,
  Layers,
  MoreHorizontal,
  PanelLeft,
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const SKILLS = ["wave_right_arm", "pick_and_place", "fold_towel"];

const SUGGESTED = [
  { icon: Hand, label: "Wave the right arm" },
  { icon: Layers, label: "Pick from tray A, place in tray B" },
  { icon: Blocks, label: "Sort the blocks by color into bins" },
  { icon: Bot, label: "Fold the towel with both arms" },
];

/* Sidebar row — 30px tall, rounded-lg; active = white pill on the off-white rail. */
function NavItem({
  icon: Icon,
  label,
  active,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      className={cn(
        "mx-0.5 flex h-[30px] items-center gap-1.5 rounded-lg px-2 text-left text-sm transition-colors",
        active
          ? "border border-border bg-background"
          : "hover:bg-surface-3",
        className,
      )}
    >
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

function SectionLabel({
  children,
  actions,
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mt-5 mb-1 flex h-5 items-center justify-between px-1.5">
      <span className="text-[13px] text-muted-foreground">{children}</span>
      {actions}
    </div>
  );
}

export default function Page() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [input, setInput] = useState("");
  const [suggestedOpen, setSuggestedOpen] = useState(true);
  const [dryRun, setDryRun] = useState(true);

  return (
    <TooltipProvider>
      <div className="fixed inset-0 flex bg-surface-2 text-foreground">
        {/* ——— Sidebar ——— */}
        {sidebarOpen && (
          <aside className="flex w-[248px] shrink-0 flex-col overflow-y-auto px-2.5 pt-3 pb-2.5">
            <div className="flex items-center justify-between">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="mx-0.5 flex h-[30px] min-w-0 items-center gap-1.5 rounded-lg px-2 text-left text-sm transition-colors hover:bg-surface-3">
                    <span className="flex size-[18px] shrink-0 items-center justify-center rounded bg-foreground text-[10px] font-medium text-background">
                      B
                    </span>
                    <span className="truncate font-medium">OpenArm v1</span>
                    <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Robots
                  </DropdownMenuLabel>
                  <DropdownMenuItem>
                    <Bot className="size-4" /> OpenArm v1 · Thor
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Plus className="size-4" /> Connect a robot
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                onClick={() => setSidebarOpen(false)}
                aria-label="Collapse sidebar"
              >
                <PanelLeft className="size-4" />
              </Button>
            </div>

            <nav className="mt-3 flex flex-col">
              <NavItem icon={SquarePen} label="New task" active />
              <NavItem icon={Search} label="Search" />
              <NavItem icon={Blocks} label="Marketplace" />
            </nav>

            <SectionLabel>Tasks</SectionLabel>
            <p className="px-2.5 text-sm text-muted-foreground">No tasks yet</p>

            <SectionLabel>Robot</SectionLabel>
            <nav className="flex flex-col">
              <NavItem icon={Brain} label="Memory" />
              <NavItem icon={FolderCode} label="Policies" />
              <NavItem icon={CalendarClock} label="Scheduled tasks" />
              <NavItem icon={ScrollText} label="Logs" />
            </nav>

            <SectionLabel
              actions={
                <span className="flex items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground"
                    aria-label="Skill options"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground"
                    aria-label="Teach a new skill"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </span>
              }
            >
              Skills
            </SectionLabel>
            <nav className="flex flex-col">
              {SKILLS.map((s) => (
                <div
                  key={s}
                  className="group mx-0.5 flex h-[30px] items-center rounded-lg pl-2 pr-1 transition-colors hover:bg-surface-3"
                >
                  <span className="truncate text-sm">{s}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto size-6 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`Run ${s}`}
                      >
                        <Play className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Run this skill</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </nav>

            <div className="mt-auto flex flex-col pt-4">
              <NavItem icon={CircleHelp} label="Help" />
              <NavItem icon={Settings} label="Settings" />
            </div>
          </aside>
        )}

        {/* ——— Main panel ——— */}
        <main
          className={cn(
            "relative m-2 flex min-w-0 flex-1 flex-col overflow-y-auto rounded-lg border border-border bg-background",
            sidebarOpen && "ml-0",
          )}
        >
          <header className="flex h-12 shrink-0 items-center justify-between px-3">
            <div>
              {!sidebarOpen && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open sidebar"
                >
                  <PanelLeft className="size-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-6 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-muted-foreground" />
                no robot connected
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 bg-destructive px-3 text-xs font-semibold tracking-wide text-white hover:bg-destructive/90"
                  >
                    STOP
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Emergency stop — aborts motion between interpolation steps
                </TooltipContent>
              </Tooltip>
            </div>
          </header>

          <div className="mx-auto flex w-full max-w-[768px] flex-1 flex-col px-4 pt-[22vh]">
            <h1 className="text-center text-[30px] font-normal tracking-[-0.01em]">
              What should the robot learn today?
            </h1>

            {/* Composer — off-white panel on the white card, radius 16. */}
            <div className="mt-7 rounded-[16px] border border-border bg-surface-2 transition-colors focus-within:border-border-strong">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
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
                  onClick={() => setInput("")}
                  className="size-7 rounded-full"
                  aria-label="Send"
                >
                  <ArrowUp className="size-4" />
                </Button>
              </div>
            </div>

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
        </main>
      </div>
    </TooltipProvider>
  );
}
