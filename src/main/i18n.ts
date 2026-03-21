/**
 * Main process i18n for menu translations
 */

type Language = 'fr' | 'en' | 'de';

interface MenuTranslations {
  [key: string]: string;
}

const translations: Record<Language, MenuTranslations> = {
  fr: {
    'menu.about': 'A propos de ClioBrain',
    'menu.settings': 'Paramètres...',
    'menu.quit': 'Quitter ClioBrain',
    'menu.workspace': 'Espace de travail',
    'menu.newWorkspace': 'Nouvel espace de travail',
    'menu.openWorkspace': 'Ouvrir un espace de travail...',
    'menu.chat': 'Chat',
    'menu.newSession': 'Nouvelle conversation',
    'menu.view': 'Affichage',
    'menu.help': 'Aide',
  },
  en: {
    'menu.about': 'About ClioBrain',
    'menu.settings': 'Settings...',
    'menu.quit': 'Quit ClioBrain',
    'menu.workspace': 'Workspace',
    'menu.newWorkspace': 'New Workspace',
    'menu.openWorkspace': 'Open Workspace...',
    'menu.chat': 'Chat',
    'menu.newSession': 'New Conversation',
    'menu.view': 'View',
    'menu.help': 'Help',
  },
  de: {
    'menu.about': 'Über ClioBrain',
    'menu.settings': 'Einstellungen...',
    'menu.quit': 'ClioBrain beenden',
    'menu.workspace': 'Arbeitsbereich',
    'menu.newWorkspace': 'Neuer Arbeitsbereich',
    'menu.openWorkspace': 'Arbeitsbereich öffnen...',
    'menu.chat': 'Chat',
    'menu.newSession': 'Neue Unterhaltung',
    'menu.view': 'Ansicht',
    'menu.help': 'Hilfe',
  },
};

let currentLanguage: Language = 'fr';

export function loadMenuTranslations() {
  // Translations are embedded, nothing to load
}

export function setLanguage(lang: string) {
  if (['fr', 'en', 'de'].includes(lang)) {
    currentLanguage = lang as Language;
  }
}

export function getCurrentLanguage(): Language {
  return currentLanguage;
}

export function getTranslation(key: string): string {
  return translations[currentLanguage]?.[key] || translations.en[key] || key;
}
