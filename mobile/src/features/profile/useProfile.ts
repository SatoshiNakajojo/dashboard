import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { initialsFrom } from '@/features/auth/profile';
import { announceProfileChange } from '@/features/auth/useAuth';
import { normalizeLinks, parseLinks, type ProfileLink } from '@/lib/profileLinks';
import { describeError, supabase } from '@/lib/supabase';
import { MEMBERS } from '@/mocks/members';
import type { Member } from '@/types/domain';

export interface ProfileDraft {
  displayName: string;
  links: ProfileLink[];
}

export interface ProfileState {
  /** Le profil tel qu'il est enregistré. `null` tant qu'on ne l'a pas lu. */
  profile: Member | null;
  loading: boolean;
  saving: boolean;
  /** Téléversement de la photo en cours — plus lent que le reste. */
  uploading: boolean;
  error: string | null;
  save: (draft: ProfileDraft) => Promise<boolean>;
  /** Ouvre la galerie, redimensionne, téléverse. `false` si on a annulé. */
  pickPhoto: () => Promise<boolean>;
  removePhoto: () => Promise<boolean>;
}

/**
 * Côté le plus long d'une photo de profil, en pixels.
 *
 * Un iPhone produit des images de 4 000 px et plusieurs mégaoctets. Téléversée
 * telle quelle, elle serait retéléchargée par les six autres membres à chaque
 * ouverture de l'app, pour être affichée dans un cercle de 34 points.
 */
const AVATAR_SIDE = 512;

/** Qualité JPEG. 0,8 est le point où l'œil cesse de voir la différence. */
const AVATAR_QUALITY = 0.8;

/**
 * Le profil du membre courant, et de quoi le modifier.
 *
 * Trois écritures distinctes plutôt qu'un gros `save` : le nom et les liens
 * partent ensemble, la photo suit son propre chemin (galerie, redimensionnement,
 * téléversement) et son propre temps. Les mêler ferait attendre un changement de
 * nom derrière un envoi d'image.
 */
export function useProfile(userId: string | null): ProfileState {
  // Sans backend, le membre fictif est l'état **initial**, pas le résultat d'un
  // effet : l'écran doit être visitable et testable sans serveur, et le poser
  // depuis un effet provoquerait un rendu vide inutile avant le premier
  // contenu — le même choix que partout ailleurs dans l'app.
  const [profile, setProfile] = useState<Member | null>(() =>
    supabase ? null : (MEMBERS.me ?? null),
  );
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Lecture -------------------------------------------------------------

  useEffect(() => {
    const client = supabase;
    // `loading` part déjà à `false` sans backend : rien à faire ici.
    if (!client || !userId) return;

    const controller = new AbortController();

    (async () => {
      const { data, error: cause } = await client
        .from('profiles')
        .select('id, display_name, initials, color, avatar_url, links')
        .eq('id', userId)
        .abortSignal(controller.signal)
        .maybeSingle();

      if (controller.signal.aborted) return;
      if (cause) {
        setError(describeError(cause));
        setLoading(false);
        return;
      }

      setProfile(
        data
          ? {
              id: data.id,
              displayName: data.display_name,
              initials: data.initials,
              color: data.color,
              avatarUrl: data.avatar_url ?? null,
              links: parseLinks(data.links),
            }
          : null,
      );
      setLoading(false);
    })();

    return () => controller.abort();
  }, [userId]);

  // --- Nom et liens --------------------------------------------------------

  const save = useCallback(
    async (draft: ProfileDraft): Promise<boolean> => {
      if (!userId || saving) return false;

      const displayName = draft.displayName.trim();
      if (!displayName) {
        setError('Il faut un prénom — c’est ce que le club voit.');
        return false;
      }

      // Les initiales suivent le nom : les laisser diverger donnerait un avatar
      // « JD » à quelqu'un qui s'appelle désormais Marco.
      const links = normalizeLinks(draft.links);
      const initials = initialsFrom(displayName);

      setSaving(true);
      const client = supabase;

      if (!client) {
        setProfile((current) =>
          current ? { ...current, displayName, initials, links } : current,
        );
        setSaving(false);
        return true;
      }

      const { error: cause } = await client
        .from('profiles')
        .update({ display_name: displayName, initials, links })
        .eq('id', userId);
      setSaving(false);

      if (cause) {
        setError(describeError(cause));
        return false;
      }

      setError(null);
      setProfile((current) =>
        current ? { ...current, displayName, initials, links } : current,
      );
      // L'annuaire et l'en-tête lisent ailleurs : sans ce signal, l'avatar
      // garderait l'ancien nom jusqu'au prochain démarrage.
      announceProfileChange();
      return true;
    },
    [userId, saving],
  );

  // --- Photo ---------------------------------------------------------------

  const setAvatar = useCallback(
    async (url: string | null): Promise<boolean> => {
      if (!userId) return false;
      const client = supabase;

      if (!client) {
        setProfile((current) => (current ? { ...current, avatarUrl: url } : current));
        return true;
      }

      const { error: cause } = await client
        .from('profiles')
        .update({ avatar_url: url })
        .eq('id', userId);
      if (cause) {
        setError(describeError(cause));
        return false;
      }

      setProfile((current) => (current ? { ...current, avatarUrl: url } : current));
      announceProfileChange();
      return true;
    },
    [userId],
  );

  const pickPhoto = useCallback(async (): Promise<boolean> => {
    if (!userId || uploading) return false;

    // Sur le web, la permission est le sélecteur de fichier lui-même : la
    // demander déclencherait une invite qui n'existe pas.
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('L’accès aux photos est refusé. Autorisez-le dans les réglages.');
        return false;
      }
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (picked.canceled || !picked.assets[0]) return false;

    setUploading(true);
    setError(null);

    try {
      // API contextuelle du SDK 57 : `manipulateAsync` est déposée. On ne fixe
      // que la largeur — la hauteur suit le ratio, et le recadrage carré a déjà
      // été fait par le sélecteur (`aspect: [1, 1]`).
      const rendered = await ImageManipulator.manipulate(picked.assets[0].uri)
        .resize({ width: AVATAR_SIDE })
        .renderAsync();
      const shrunk = await rendered.saveAsync({
        compress: AVATAR_QUALITY,
        format: SaveFormat.JPEG,
      });

      const client = supabase;
      if (!client) {
        // Mode mock : l'image reste locale, ce qui suffit à voir l'écran vivre.
        await setAvatar(shrunk.uri);
        return true;
      }

      const blob = await (await fetch(shrunk.uri)).blob();
      // Le chemin commence par l'identifiant du membre : c'est ce que vérifie
      // la politique `avatars_write_own`. L'horodatage évite qu'un cache
      // serve l'ancienne photo après un changement.
      const path = `${userId}/${Date.now()}.jpg`;

      const { error: cause } = await client.storage
        .from('avatars')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (cause) {
        setError(describeError(cause));
        return false;
      }

      const { data } = client.storage.from('avatars').getPublicUrl(path);
      return await setAvatar(data.publicUrl);
    } catch (cause) {
      setError(describeError(cause));
      return false;
    } finally {
      setUploading(false);
    }
  }, [userId, uploading, setAvatar]);

  const removePhoto = useCallback(async () => {
    // On ne supprime pas l'objet du bucket : la ligne cesse simplement d'y
    // renvoyer. Un fichier orphelin de 40 Ko coûte moins cher qu'une photo
    // effacée chez quelqu'un dont l'app avait encore l'ancienne URL en cache.
    return setAvatar(null);
  }, [setAvatar]);

  return { profile, loading, saving, uploading, error, save, pickPhoto, removePhoto };
}
