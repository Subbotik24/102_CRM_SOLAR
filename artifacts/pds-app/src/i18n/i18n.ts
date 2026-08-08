import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ukAdmin from './locales/uk/admin.json';
import ukAuth from './locales/uk/auth.json';
import ukChat from './locales/uk/chat.json';
import ukCommon from './locales/uk/common.json';
import ukEmails from './locales/uk/emails.json';
import ukEvents from './locales/uk/events.json';
import ukFiles from './locales/uk/files.json';
import ukJournal from './locales/uk/journal.json';
import ukKb from './locales/uk/kb.json';
import ukProjects from './locales/uk/projects.json';
import ukTasks from './locales/uk/tasks.json';
import ukValidation from './locales/uk/validation.json';

import csAdmin from './locales/cs/admin.json';
import csAuth from './locales/cs/auth.json';
import csChat from './locales/cs/chat.json';
import csCommon from './locales/cs/common.json';
import csEmails from './locales/cs/emails.json';
import csEvents from './locales/cs/events.json';
import csFiles from './locales/cs/files.json';
import csJournal from './locales/cs/journal.json';
import csKb from './locales/cs/kb.json';
import csProjects from './locales/cs/projects.json';
import csTasks from './locales/cs/tasks.json';
import csValidation from './locales/cs/validation.json';

const resources = {
  uk: {
    admin: ukAdmin,
    auth: ukAuth,
    chat: ukChat,
    common: ukCommon,
    emails: ukEmails,
    events: ukEvents,
    files: ukFiles,
    journal: ukJournal,
    kb: ukKb,
    projects: ukProjects,
    tasks: ukTasks,
    validation: ukValidation,
  },
  cs: {
    admin: csAdmin,
    auth: csAuth,
    chat: csChat,
    common: csCommon,
    emails: csEmails,
    events: csEvents,
    files: csFiles,
    journal: csJournal,
    kb: csKb,
    projects: csProjects,
    tasks: csTasks,
    validation: csValidation,
  },
};

const savedLocale = localStorage.getItem('pds.locale') || 'uk';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLocale,
    fallbackLng: 'uk',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
