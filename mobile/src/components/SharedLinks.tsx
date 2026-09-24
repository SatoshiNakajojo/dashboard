import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';

import { Micro } from '@/components/ui/Micro';
import { linkKind, openableUrl, shortenUrl, type ProfileLink } from '@/lib/profileLinks';
import { c, f } from '@/theme/tokens';

/** Au-delà, « COPIÉ » n'est plus une confirmation mais un état. */
const FLASH_MS = 2200;

/**
 * Les liens qu'un membre partage au club, en lecture.
 *
 * Une adresse web s'ouvre ; tout le reste — une adresse BTC, un MetaMask — se
 * copie. `src/lib/profileLinks.ts` en décide, et c'est aussi la porte fermée
 * à `javascript:` : rien d'autre que http(s) ne s'ouvre jamais.
 */
export function SharedLinks({ links }: { links: readonly ProfileLink[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const openOrCopy = async (link: ProfileLink) => {
    const url = openableUrl(link.url);
    if (url) {
      await Linking.openURL(url);
      return;
    }
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(link.url.trim()).catch(() => {});
    }
    setCopied(link.url);
  };

  return (
    <View>
      {links.map((link) => {
        const web = linkKind(link.url) === 'web';
        const done = copied === link.url;
        return (
          <Pressable
            key={`${link.label}-${link.url}`}
            accessibilityRole="link"
            accessibilityLabel={`${web ? 'Ouvrir' : 'Copier'} ${link.label || link.url}`}
            onPress={() => void openOrCopy(link)}
            className="border-b border-hairline"
            style={{ paddingVertical: 13, paddingHorizontal: 2, gap: 5 }}
          >
            <View className="flex-row items-center justify-between">
              <Text style={{ fontFamily: f.sansSemi, fontSize: 13, color: c.bone }}>
                {link.label || (web ? 'Lien' : 'Adresse')}
              </Text>
              <Micro size={9} tracking={1.4} style={{ color: done ? c.sage : c.gold }}>
                {done ? 'COPIÉ' : web ? 'OUVRIR ↗' : 'COPIER'}
              </Micro>
            </View>
            {/* L'adresse garde sa casse : une adresse Ethereum porte sa somme
                de contrôle dans la casse de ses lettres. */}
            <Text
              numberOfLines={1}
              style={{ fontFamily: f.label, fontSize: 11, letterSpacing: 0.3, color: c.sepia }}
            >
              {shortenUrl(link.url, 40)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
