import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, Globe, Folder, Play, Search, GitBranch,
  Calendar, CheckSquare, Server, Cpu, Activity,
  ChevronDown, Code2, Trash2, FolderPlus,
  FileText, FilePlus, GitCommit, GitPullRequest, Package,
  Info, Eye, Zap, ExternalLink, LayoutDashboard, RefreshCw,
  MessageSquare
} from 'lucide-react';

interface SidebarToolsProps {
  onToolSelect: (toolName: string, prompt?: string) => void;
}

interface ToolItem {
  icon: React.ReactNode;
  label: string;
  tool: string;
  prompt?: string; // Natural language prompt sent to Rudi
  badge?: 'SAFE' | 'CAUTION' | 'DANGER';
}

export const SidebarTools: React.FC<SidebarToolsProps> = ({ onToolSelect }) => {
  const [workspace, setWorkspace] = useState<string>('');

  useEffect(() => {
    if (window.desktopAPI?.getWorkspace) {
      window.desktopAPI.getWorkspace().then(setWorkspace).catch(() => {});
    }
  }, []);

  const handlePickWorkspace = async () => {
    if (!window.desktopAPI?.pickWorkspace) return;
    const chosen = await window.desktopAPI.pickWorkspace();
    if (chosen) setWorkspace(chosen);
  };

  const workspaceBasename = workspace
    ? workspace.split(/[\\/]/).filter(Boolean).pop() ?? workspace
    : 'No workspace';

  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({
    System: true,
    Files: false,
    Development: false,
    Git: false,
    Browser: false,
    Productivity: false,
  });

  const toggleCat = (cat: string) => {
    setExpandedCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const categories: { title: string; icon: React.ReactNode; key: string; items: ToolItem[] }[] = [
    {
      title: 'System', key: 'System', icon: <Cpu size={15} />,
      items: [
        { icon: <Info size={14} />,     label: 'System Info',        tool: 'system_info',    prompt: 'Provide a comprehensive detailed report on this machine\'s hardware, resources, and status.', badge: 'SAFE' },
        { icon: <Play size={14} />,     label: 'Open App…',          tool: 'open_app',       prompt: 'Open an application for me.', badge: 'SAFE' },
        { icon: <Terminal size={14} />, label: 'Run Command',         tool: 'run_terminal',   prompt: 'Run a terminal command.', badge: 'CAUTION' },
        { icon: <Activity size={14} />, label: 'Diagnostics',         tool: 'system_info',   prompt: 'Run a full system diagnostic and report the status.', badge: 'SAFE' },
      ]
    },
    {
      title: 'VS Code', key: 'Development', icon: <Code2 size={15} />,
      items: [
        { icon: <Code2 size={14} />,     label: 'Open VS Code',       tool: 'open_vscode',        prompt: 'Open Visual Studio Code please.', badge: 'SAFE' },
        { icon: <Folder size={14} />,    label: 'Open Folder in VSC', tool: 'open_vscode',        prompt: 'Open a specific folder in Visual Studio Code.', badge: 'SAFE' },
        { icon: <FileText size={14} />,  label: 'Open File in VSC',   tool: 'open_vscode_file',   prompt: 'Open a specific file in VS Code.', badge: 'SAFE' },
        { icon: <FilePlus size={14} />,  label: 'Create & Open File', tool: 'write_code',         prompt: 'Create a new code file and open it in VS Code.', badge: 'SAFE' },
        { icon: <Server size={14} />,    label: 'Start Dev Server',   tool: 'start_dev_server',   prompt: 'Start the development server for the current project.', badge: 'CAUTION' },
        { icon: <Package size={14} />,   label: 'npm install',        tool: 'npm_install',        prompt: 'Run npm install in the current project directory.', badge: 'CAUTION' },
        { icon: <RefreshCw size={14} />, label: 'npm install [pkg]',  tool: 'npm_install',        prompt: 'Install a specific npm package.', badge: 'CAUTION' },
        { icon: <Zap size={14} />,       label: 'Code With Me',       tool: 'write_code',         prompt: 'I want you to help me code something. Let\'s work together on a new feature.', badge: 'SAFE' },
      ]
    },
    {
      title: 'Project', key: 'Project', icon: <Package size={15} />,
      items: [
        { icon: <Search size={14} />,     label: 'Search Project',     tool: 'search_project', prompt: 'Search the entire project for a specific string.', badge: 'SAFE' },
        { icon: <RefreshCw size={14} />,  label: 'Undo Last Action',   tool: 'undo_action',    prompt: 'Undo the last file or git operation I performed.', badge: 'SAFE' },
        { icon: <Package size={14} />,   label: 'Package Rudi OS',    tool: 'package_app',    prompt: 'Start the full packaging workflow to create a Windows installer for Rudi.', badge: 'DANGER' },
        { icon: <Activity size={14} />,  label: 'Self Inspect',       tool: 'self_inspect',   prompt: 'Analyze your own codebase and suggest improvements.', badge: 'SAFE' },
      ]
    },
    {
      title: 'Files', key: 'Files', icon: <Folder size={15} />,
      items: [
        { icon: <Eye size={14} />,       label: 'List Directory',     tool: 'list_dir',      prompt: 'List the contents of a directory.', badge: 'SAFE' },
        { icon: <FileText size={14} />,  label: 'Read File',          tool: 'read_file',     prompt: 'Read the contents of a file.', badge: 'SAFE' },
        { icon: <FilePlus size={14} />,  label: 'Create File',        tool: 'create_file',   prompt: 'Create a new file with some content.', badge: 'SAFE' },
        { icon: <FolderPlus size={14}/>, label: 'Create Folder',      tool: 'create_folder', prompt: 'Create a new folder.', badge: 'SAFE' },
        { icon: <Trash2 size={14} />,    label: 'Delete File',        tool: 'delete_file',   prompt: 'Delete a file.', badge: 'DANGER' },
      ]
    },
    {
      title: 'Git', key: 'Git', icon: <GitBranch size={15} />,
      items: [
        { icon: <GitBranch size={14} />,  label: 'Git Status',      tool: 'git_status', prompt: 'Show me the current git status of the project.', badge: 'SAFE' },
        { icon: <GitCommit size={14} />,  label: 'Git Commit',      tool: 'git_commit', prompt: 'Commit all changes with an appropriate message.', badge: 'CAUTION' },
        { icon: <GitPullRequest size={14} />, label: 'Git Push',    tool: 'git_push',   prompt: 'Push all committed changes to remote repository.', badge: 'DANGER' },
      ]
    },
    {
      title: 'Browser', key: 'Browser', icon: <Globe size={15} />,
      items: [
        { icon: <ExternalLink size={14} />, label: 'Open Website',    tool: 'open_url',    prompt: 'Open a website in my browser.', badge: 'SAFE' },
        { icon: <Search size={14} />,       label: 'Search Google',   tool: 'search_web',  prompt: 'Search Google for something.', badge: 'SAFE' },
        { icon: <MessageSquare size={14} />,label: 'Open ChatGPT',    tool: 'open_url',    prompt: 'Open ChatGPT in the browser at https://chat.openai.com', badge: 'SAFE' },
        { icon: <Globe size={14} />,        label: 'Open GitHub',     tool: 'open_url',    prompt: 'Open GitHub in the browser.', badge: 'SAFE' },
      ]
    },
    {
      title: 'Productivity', key: 'Productivity', icon: <CheckSquare size={15} />,
      items: [
        { icon: <Calendar size={14} />,     label: 'Daily Briefing', tool: 'daily_briefing', prompt: 'Provide a concise summary of the schedule, pending tasks, and global objectives for the day.', badge: 'SAFE' },
        { icon: <CheckSquare size={14} />,  label: 'Tasks',          tool: 'list_tasks',     prompt: 'Show me my current task list and let me manage them.', badge: 'SAFE' },
        { icon: <Calendar size={14} />,     label: 'Calendar',       tool: 'read_calendar',  prompt: 'Show me my calendar events and upcoming schedule.', badge: 'SAFE' },
        { icon: <FileText size={14} />,     label: 'Meeting Notes',  tool: 'list_meeting_notes', prompt: 'Show me my recorded meeting notes and summaries.', badge: 'SAFE' },
        { icon: <LayoutDashboard size={14}/>, label: 'Full Summary', tool: 'summarize',      prompt: 'Provide a comprehensive summary of my activity, tasks, and notes.', badge: 'SAFE' },
      ]
    },
  ];

  const badgeColors: Record<string, string> = {
    SAFE:   'text-emerald-400/70 bg-emerald-500/10',
    CAUTION:'text-amber-400/70 bg-amber-500/10',
    DANGER: 'text-red-400/70 bg-red-500/10',
  };

  return (
    <aside
      className="w-[260px] h-full overflow-y-auto custom-scrollbar border-r border-white/8 bg-black/70 backdrop-blur-xl flex flex-col pt-14 pointer-events-auto shrink-0"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/20">
        <p className="text-[9px] uppercase tracking-[0.2em] text-white/80 font-bold">Rudi Command Center</p>
      </div>

      {/* Workspace bar */}
      <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2 bg-white/5">
        <Folder size={12} className="text-cyan-400 shrink-0" />
        <span
          className="text-[10px] text-white/70 truncate flex-1 font-mono"
          title={workspace}
        >
          {workspaceBasename}
        </span>
        <button
          onClick={handlePickWorkspace}
          className="text-[9px] uppercase tracking-wider text-cyan-400/80 hover:text-cyan-300 transition-colors shrink-0 px-1.5 py-0.5 rounded hover:bg-white/10"
          title="Change active workspace"
        >
          Change
        </button>
      </div>

      <nav className="flex flex-col gap-1 px-2 pb-10 pt-2">
        {categories.map(cat => (
          <ToolCategory
            key={cat.key}
            title={cat.title}
            icon={cat.icon}
            open={expandedCats[cat.key]}
            toggle={() => toggleCat(cat.key)}
          >
            {cat.items.map(item => (
              <SidebarItem
                key={item.tool + item.label}
                icon={item.icon}
                label={item.label}
                badge={item.badge}
                badgeColors={badgeColors}
                onClick={() => onToolSelect(item.tool, item.prompt)}
              />
            ))}
          </ToolCategory>
        ))}
      </nav>
    </aside>
  );
};

const ToolCategory = ({ title, icon, open, toggle, children }: any) => (
  <div className="flex flex-col">
    <button
      onClick={toggle}
      className="flex items-center justify-between text-white/90 hover:text-white uppercase text-[9px] tracking-[0.18em] font-bold px-3 py-2 rounded-lg hover:bg-white/20 transition-all group"
    >
      <div className="flex items-center gap-2 text-white group-hover:text-white transition-colors">
        {icon} {title}
      </div>
      <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
        <ChevronDown size={12} className="text-white/70" />
      </motion.div>
    </button>
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div className="flex flex-col gap-0.5 pl-3 ml-2 border-l border-white/8 mb-2">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

const SidebarItem = ({
  icon, label, badge, badgeColors, onClick
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  badgeColors: Record<string, string>;
  onClick: () => void;
}) => (
  <motion.button
    whileHover={{ x: 3 }}
    whileTap={{ scale: 0.97 }}
    onClick={onClick}
    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg transition-all text-white/90 hover:bg-white/20 hover:text-cyan-200 group w-full font-medium"
  >
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="shrink-0 text-white/70 group-hover:text-cyan-300 transition-colors">{icon}</span>
      <span className="text-[11px] text-white tracking-wide truncate">{label}</span>
    </div>
    {badge && (
      <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${badgeColors[badge] || ''}`}>
        {badge}
      </span>
    )}
  </motion.button>
);
