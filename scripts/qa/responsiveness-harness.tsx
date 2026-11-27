/* Browser-only audit harness; never imported by the application entry points. */
import React, { Component, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import { Toaster } from "../../src/components/ui/toaster";
import { Header } from "../../src/components/layout/Header";
import { Sidebar } from "../../src/components/layout/Sidebar";
import surfaces from "./responsiveness-surfaces.json";
import "../../src/index.css";
import type { User } from "../../src/types";
import { ClientRequestTracking } from "../../src/pages/ClientRequestTracking";

declare global {
  interface Window {
    __responsiveQA: { ready: boolean; error?: string; pending: () => number };
    __responsiveFixtures: Record<string, unknown> & { user: User };
    __responsiveQARoot?: Root;
  }
}

const query = new URLSearchParams(location.search);
const surface = surfaces.find(item => item.id === query.get("surface"));
if (!surface) throw new Error("Unknown responsiveness audit surface");
const definition = surface as typeof surface & { props?: Record<string, unknown>; role?: string; dialog?: boolean; public?: boolean; crms?: boolean; chat?: boolean; path?: string; route?: string; kind?: string };
const fixtures = window.__responsiveFixtures;
const selectedRole = query.get("role") || definition.role || fixtures.user.role;
const user = { ...fixtures.user, role: selectedRole, module_roles: { cims: selectedRole, crms: selectedRole } } as User;
localStorage.setItem("riana_user", JSON.stringify(user));
localStorage.setItem("riana-auth-token", "isolated-browser-qa-not-a-real-token");
localStorage.setItem("crms-user-session", JSON.stringify(user));
localStorage.setItem("crms-user-id", user.id);
localStorage.setItem("crms-user-role", user.role);
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
window.__responsiveQA = { ready: false, pending: () => client.isFetching() };

class AuditBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  componentDidCatch(error: Error) { window.__responsiveQA.error = error.stack || error.message; window.__responsiveQA.ready = true; }
  render() { return this.state.error ? <pre role="alert">{this.state.error}</pre> : this.props.children; }
}

function Shell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return <div className="flex h-dvh min-h-0 overflow-hidden" id="cims-authenticated-shell">
    <Sidebar user={user} activeModule={definition.id} setActiveModule={() => {}} isMobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
    <div className="flex min-w-0 flex-1 flex-col">
      <Header user={user} onOpenMobileMenu={() => setMobileOpen(true)} setActiveModule={() => {}} />
      <main className="cims-content min-w-0 flex-1 overflow-auto overscroll-contain p-3 sm:p-5 lg:p-7"><div className="mx-auto w-full max-w-[1600px] min-w-0">{children}</div></main>
      <footer className="cims-system-footer shrink-0 border-t border-border bg-muted/30 px-3 py-2 text-center sm:px-4 sm:py-3"><p className="truncate text-[10px] text-muted-foreground sm:text-xs">© 2026 RIANA Group. All rights reserved. | www.riana.co</p></footer>
    </div>
  </div>;
}

const noop = () => {};
const blankChat = {
  users: [{ ...user, id: "qa-colleague", first_name: "Jamie", is_online: true }], messages: [], selectedUser: null,
  setSelectedUser: noop, sendMessage: async () => {}, editMessage: async () => {}, toggleReaction: async () => {}, deleteMessageForMe: async () => {}, deleteMessageForEveryone: async () => {}, loadMessages: async () => {},
  isLoading: false, isConnected: true, unreadCounts: {}, totalUnread: 0, typingUsers: {}, sendTypingStatus: noop, activeCall: null, incomingCall: null, missedCalls: [], callSignals: [], callRecordings: [],
  sendCallInvite: async () => {}, updateCallStatus: async () => {}, sendCallSignal: async () => {}, clearCallSignals: noop, clearCallState: noop, inviteCallParticipants: async () => {}, cancelCallInvitation: async () => {}, getCallIceServers: async () => [], onlineUserCount: 1, isLoadingUsers: false, usersError: null, loadUsers: async () => {},
  isLoadingRecordings: false, loadCallRecordings: async () => {}, startCallRecording: async () => {}, stopCallRecording: async () => {}, failCallRecording: async () => {}, deleteCallRecording: async () => {}, dismissingMissedCallIds: new Set(),
};

function Ready({ children }: { children: ReactNode }) {
  useEffect(() => { window.__responsiveQA.ready = true; }, []);
  return children;
}

async function mount() {
  const module = await import(/* @vite-ignore */ definition.file);
  const View = module[definition.name] as ComponentType<Record<string, unknown>>;
  const props: Record<string, unknown> = {
    user, currentUser: user, userId: user.id, role: user.role, client: fixtures.client, installation: fixtures.installation,
    isOpen: true, open: true, onClose: noop, onOpenChange: noop, onSave: noop, onNavigate: noop, onProfileUpdate: noop,
    departments: [], subsidiaries: [], status: { enabled: true, message: "Scheduled maintenance is in progress." },
    chat: definition.chat && fixtures.meetingChat
      ? { ...blankChat, ...fixtures.meetingChat as object, inviteCallParticipants: async (_callId: string, ids: string[]) => {
          window.dispatchEvent(new CustomEvent('qa-meeting-invite', { detail: ids }));
          return { invited_user_ids: ids };
        } }
      : blankChat,
    ...definition.props,
  };
  let view = <View {...props} />;
  if (definition.name === "__probe") {
    const kind = definition.kind!;
    const rootProps = { open: true, onOpenChange: noop };
    const items = Array.from({ length: 35 }, (_, i) => `Option ${i + 1}: a detailed synthetic record description`);
    const h = React.createElement;
    if (kind === "AlertDialog") view = h(module.AlertDialog, rootProps,
      h(module.AlertDialogContent, {}, h(module.AlertDialogHeader, {}, h(module.AlertDialogTitle, {}, "Confirm record action"), h(module.AlertDialogDescription, {}, "Review these details before continuing.")),
        ...items.map(text => h("p", { key: text }, text)), h(module.AlertDialogFooter, {}, h(module.AlertDialogCancel, {}, "Cancel"), h(module.AlertDialogAction, {}, "Continue"))));
    if (kind === "Select") view = h(module.Select, { ...rootProps, value: "0" }, h(module.SelectTrigger, {}, h(module.SelectValue, { placeholder: "Select a record" })), h(module.SelectContent, {}, h(module.SelectGroup, {}, ...items.map((text, i) => h(module.SelectItem, { key: text, value: String(i) }, text)))));
    if (kind === "Popover") view = h(module.Popover, rootProps, h(module.PopoverTrigger, {}, "Show records"), h(module.PopoverContent, {}, ...items.map(text => h("p", { key: text }, text))));
    if (kind === "DropdownMenu") view = h(module.DropdownMenu, rootProps, h(module.DropdownMenuTrigger, {}, "Record actions"), h(module.DropdownMenuContent, {}, ...items.map(text => h(module.DropdownMenuItem, { key: text }, text))));
  }
  const page = definition.public ? view : <Shell>{definition.chat ? <div className="h-[calc(100dvh-8rem)] min-h-0">{view}</div> : view}</Shell>;
  const root = window.__responsiveQARoot ||= createRoot(document.getElementById("root")!);
  root.render(
    <AuditBoundary><QueryClientProvider client={client}><TooltipProvider><Toaster />
      <MemoryRouter initialEntries={[definition.path || "/qa"]}>
        <Routes><Route path={definition.route || "*"} element={<Ready>{page}</Ready>} />{definition.id === 'client-request-submit' && <Route path="/change-request/track/:token" element={<ClientRequestTracking />} />}</Routes>
      </MemoryRouter>
    </TooltipProvider></QueryClientProvider></AuditBoundary>,
  );
}

void mount().catch((error: Error) => { window.__responsiveQA.error = error.message; window.__responsiveQA.ready = true; });
