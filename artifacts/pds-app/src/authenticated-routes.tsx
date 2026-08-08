import { lazy } from 'react';
import { Route, Switch } from 'wouter';

import { AuthGuard } from '@/components/auth/auth-guard';
import { AppShell } from '@/components/layout/app-shell';
import { filesEnabled } from '@/lib/features';

const NotFound = lazy(() => import('@/pages/not-found'));
const HomePage = lazy(() => import('@/pages/home'));
const TasksPage = lazy(() => import('@/pages/tasks'));
const ProjectsPage = lazy(() => import('@/pages/projects'));
const ProjectDetailPage = lazy(() => import('@/pages/project-detail'));
const JournalPage = lazy(() => import('@/pages/journal'));
const ChatPage = lazy(() => import('@/pages/chat'));
const MorePage = lazy(() => import('@/pages/more'));
const TaskDetailPage = lazy(() => import('@/pages/task-detail'));
const ClientsPage = lazy(() => import('@/pages/clients'));
const ClientDetailPage = lazy(() => import('@/pages/client-detail'));
const AdminDropboxPage = lazy(() => import('@/pages/admin-dropbox'));
const AdminUsersPage = lazy(() => import('@/pages/admin-users'));
const AdminAuditLogPage = lazy(() => import('@/pages/admin-audit-log'));
const AdminSettingsPage = lazy(() => import('@/pages/admin-settings'));
const KbPage = lazy(() => import('@/pages/kb'));
const MembersPage = lazy(() => import('@/pages/members'));
const SettingsPage = lazy(() => import('@/pages/settings'));
const ArchivePage = lazy(() => import('@/pages/archive'));
const LibraryPage = lazy(() => import('@/pages/library'));
const KanbanPage = lazy(() => import('@/pages/kanban'));
const CalendarPage = lazy(() => import('@/pages/calendar'));

export default function AuthenticatedRoutes() {
  return (
    <AuthGuard>
      <AppShell>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/tasks" component={TasksPage} />
          <Route path="/projects" component={ProjectsPage} />
          <Route path="/projects/:id/journal" component={JournalPage} />
          <Route path="/projects/:id" component={ProjectDetailPage} />
          <Route path="/tasks/:id" component={TaskDetailPage} />
          <Route path="/clients" component={ClientsPage} />
          <Route path="/clients/:id" component={ClientDetailPage} />
          <Route path="/chat/:id" component={ChatPage} />
          <Route path="/chat" component={ChatPage} />
          {filesEnabled ? <Route path="/admin/dropbox" component={AdminDropboxPage} /> : null}
          <Route path="/admin/users" component={AdminUsersPage} />
          <Route path="/admin/audit-log" component={AdminAuditLogPage} />
          <Route path="/admin/settings" component={AdminSettingsPage} />
          <Route path="/projects/:id/kb" component={KbPage} />
          <Route path="/members" component={MembersPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/archive" component={ArchivePage} />
          <Route path="/library" component={LibraryPage} />
          <Route path="/kanban" component={KanbanPage} />
          <Route path="/calendar" component={CalendarPage} />
          <Route path="/more" component={MorePage} />
          <Route component={NotFound} />
        </Switch>
      </AppShell>
    </AuthGuard>
  );
}
