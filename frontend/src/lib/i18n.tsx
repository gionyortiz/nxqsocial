'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

// Supported languages shown in the picker.
export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'es', label: 'Spanish', native: 'Español' },
  { code: 'fr', label: 'French', native: 'Français' },
  { code: 'pt', label: 'Portuguese', native: 'Português' },
  { code: 'de', label: 'German', native: 'Deutsch' },
] as const;

export type LangCode = (typeof LANGUAGES)[number]['code'];

// Translation dictionary. English is the source of truth; other languages
// fall back to English for any missing key.
const STRINGS: Record<string, Record<LangCode, string>> = {
  // ── Navigation ──────────────────────────────────────────────
  'nav.home':    { en: 'Home',    es: 'Inicio',     fr: 'Accueil',   pt: 'Início',     de: 'Start' },
  'nav.explore': { en: 'Explore', es: 'Explorar',   fr: 'Explorer',  pt: 'Explorar',   de: 'Entdecken' },
  'nav.reels':   { en: 'Reels',   es: 'Reels',      fr: 'Reels',     pt: 'Reels',      de: 'Reels' },
  'nav.call':    { en: 'Call',    es: 'Llamar',     fr: 'Appel',     pt: 'Chamar',     de: 'Anruf' },
  'nav.create':  { en: 'Create',  es: 'Crear',      fr: 'Créer',     pt: 'Criar',      de: 'Erstellen' },
  'nav.verify':  { en: 'Verify',  es: 'Verificar',  fr: 'Vérifier',  pt: 'Verificar',  de: 'Verifizieren' },
  'nav.messages':{ en: 'Messages',es: 'Mensajes',   fr: 'Messages',  pt: 'Mensagens',  de: 'Nachrichten' },
  'nav.notifications':{ en: 'Notifications', es: 'Notificaciones', fr: 'Notifications', pt: 'Notificações', de: 'Benachrichtigungen' },
  'nav.feedback':{ en: 'Feedback',es: 'Comentarios',fr: 'Feedback',  pt: 'Feedback',   de: 'Feedback' },
  'nav.menu':    { en: 'Menu',    es: 'Menú',       fr: 'Menu',      pt: 'Menu',       de: 'Menü' },
  'nav.settings':{ en: 'Settings',es: 'Ajustes',    fr: 'Paramètres',pt: 'Configurações',de: 'Einstellungen' },
  'nav.logout':  { en: 'Log out', es: 'Cerrar sesión', fr: 'Déconnexion', pt: 'Sair',  de: 'Abmelden' },
  'nav.moderation':{ en: 'Moderation', es: 'Moderación', fr: 'Modération', pt: 'Moderação', de: 'Moderation' },
  'nav.profile': { en: 'Profile', es: 'Perfil',     fr: 'Profil',    pt: 'Perfil',     de: 'Profil' },

  // ── Menu panel ──────────────────────────────────────────────
  'menu.title':     { en: 'Menu',      es: 'Menú',        fr: 'Menu',       pt: 'Menu',       de: 'Menü' },
  'menu.shortcuts': { en: 'Shortcuts', es: 'Accesos directos', fr: 'Raccourcis', pt: 'Atalhos', de: 'Verknüpfungen' },
  'menu.create':    { en: 'Create',    es: 'Crear',       fr: 'Créer',      pt: 'Criar',      de: 'Erstellen' },
  'menu.account':   { en: 'Account',   es: 'Cuenta',      fr: 'Compte',     pt: 'Conta',      de: 'Konto' },
  'menu.post':      { en: 'Post',      es: 'Publicación', fr: 'Publication',pt: 'Publicação', de: 'Beitrag' },
  'menu.reel':      { en: 'Reel',      es: 'Reel',        fr: 'Reel',       pt: 'Reel',       de: 'Reel' },
  'menu.viewProfile':{ en: 'View profile', es: 'Ver perfil', fr: 'Voir le profil', pt: 'Ver perfil', de: 'Profil ansehen' },

  // ── Settings ────────────────────────────────────────────────
  'settings.title':    { en: 'Settings',    es: 'Ajustes',     fr: 'Paramètres', pt: 'Configurações', de: 'Einstellungen' },
  'settings.account':  { en: 'Account',     es: 'Cuenta',      fr: 'Compte',     pt: 'Conta',      de: 'Konto' },
  'settings.editProfile':{ en: 'Edit profile', es: 'Editar perfil', fr: 'Modifier le profil', pt: 'Editar perfil', de: 'Profil bearbeiten' },
  'settings.changePassword':{ en: 'Change password', es: 'Cambiar contraseña', fr: 'Changer le mot de passe', pt: 'Alterar senha', de: 'Passwort ändern' },
  'settings.notifications':{ en: 'Notifications', es: 'Notificaciones', fr: 'Notifications', pt: 'Notificações', de: 'Benachrichtigungen' },
  'settings.emailNotifications':{ en: 'Email notifications', es: 'Notificaciones por correo', fr: 'Notifications par e-mail', pt: 'Notificações por e-mail', de: 'E-Mail-Benachrichtigungen' },
  'settings.privacy':  { en: 'Privacy',     es: 'Privacidad',  fr: 'Confidentialité', pt: 'Privacidade', de: 'Datenschutz' },
  'settings.blocked':  { en: 'Blocked accounts', es: 'Cuentas bloqueadas', fr: 'Comptes bloqués', pt: 'Contas bloqueadas', de: 'Blockierte Konten' },
  'settings.language': { en: 'Language',    es: 'Idioma',      fr: 'Langue',     pt: 'Idioma',     de: 'Sprache' },
  'settings.chooseLanguage':{ en: 'Choose language', es: 'Elige idioma', fr: 'Choisir la langue', pt: 'Escolher idioma', de: 'Sprache wählen' },
  'settings.logout':   { en: 'Log out',     es: 'Cerrar sesión', fr: 'Déconnexion', pt: 'Sair',     de: 'Abmelden' },
  'settings.deleteAccount':{ en: 'Delete account', es: 'Eliminar cuenta', fr: 'Supprimer le compte', pt: 'Excluir conta', de: 'Konto löschen' },

  // ── Common buttons ──────────────────────────────────────────
  'common.cancel':  { en: 'Cancel',  es: 'Cancelar',  fr: 'Annuler',  pt: 'Cancelar', de: 'Abbrechen' },
  'common.save':    { en: 'Save',    es: 'Guardar',   fr: 'Enregistrer', pt: 'Salvar', de: 'Speichern' },
  'common.close':   { en: 'Close',   es: 'Cerrar',    fr: 'Fermer',   pt: 'Fechar',   de: 'Schließen' },
  'common.follow':  { en: 'Follow',  es: 'Seguir',    fr: 'Suivre',   pt: 'Seguir',   de: 'Folgen' },
  'common.following':{ en: 'Following', es: 'Siguiendo', fr: 'Abonné', pt: 'Seguindo', de: 'Abonniert' },

  // ── Profile ─────────────────────────────────────────────────
  'profile.posts':     { en: 'Posts',     es: 'Publicaciones', fr: 'Publications', pt: 'Publicações', de: 'Beiträge' },
  'profile.followers': { en: 'Followers', es: 'Seguidores', fr: 'Abonnés',  pt: 'Seguidores', de: 'Follower' },
  'profile.following': { en: 'Following', es: 'Siguiendo',  fr: 'Abonnements', pt: 'Seguindo', de: 'Folgt' },
};

const STORAGE_KEY = 'nxq_language';
const EVENT = 'nxq-language-change';

function readLang(): LangCode {
  if (typeof window === 'undefined') return 'en';
  const saved = window.localStorage.getItem(STORAGE_KEY) as LangCode | null;
  return saved && LANGUAGES.some((l) => l.code === saved) ? saved : 'en';
}

interface I18nValue {
  lang: LangCode;
  setLang: (code: LangCode) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => readLang());

  // Keep the <html lang> attribute in sync and react to cross-tab updates.
  useEffect(() => {
    document.documentElement.lang = lang;
    // React to changes made in other tabs or components.
    const onChange = () => {
      const next = readLang();
      setLangState(next);
      document.documentElement.lang = next;
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [lang]);

  const setLang = useCallback((code: LangCode) => {
    window.localStorage.setItem(STORAGE_KEY, code);
    document.documentElement.lang = code;
    setLangState(code);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const t = useCallback(
    (key: string) => {
      const entry = STRINGS[key];
      if (!entry) return key;
      return entry[lang] ?? entry.en ?? key;
    },
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Safe fallback if used outside the provider.
    return {
      lang: 'en',
      setLang: () => {},
      t: (key: string) => STRINGS[key]?.en ?? key,
    };
  }
  return ctx;
}
