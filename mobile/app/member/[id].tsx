import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SharedLinks } from '@/components/SharedLinks';
import { Avatar } from '@/components/ui/Avatar';
import { Micro } from '@/components/ui/Micro';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { useMembers } from '@/hooks/useMembers';
import { useSession } from '@/hooks/useSession';
import { c, f, radius } from '@/theme/tokens';

/**
 * Le profil d'un membre, en lecture.
 *
 * On y arrive en touchant son avatar, n'importe où dans l'app. On y lit ce
 * qu'il a choisi de montrer au club : sa photo, et ses liens — un GitHub qui
 * s'ouvre, une adresse BTC qui se copie. Rien ne s'y modifie ; pour son propre
 * profil, un bouton mène à la page d'édition.
 */
export default function MemberScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { byId, loading } = useMembers();
  const { userId } = useSession();

  const member = id ? byId.get(id) : undefined;
  const isMe = Boolean(member && member.id === userId);

  return (
    <View className="flex-1 bg-ink" style={{ paddingTop: insets.top }}>
      <View
        className="flex-row items-center justify-between"
        style={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 14 }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={10}
        >
          <Micro tracking={1.6} style={{ color: c.sepiaMuted }}>
            RETOUR
          </Micro>
        </Pressable>
        <Text style={{ fontFamily: f.display, fontSize: 21, color: c.ivory }}>Profil</Text>
        <View style={{ width: 52 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 22,
          paddingBottom: 40 + insets.bottom,
          gap: 28,
        }}
        showsVerticalScrollIndicator={false}
      >
        {!member ? (
          <Text
            style={{ fontFamily: f.serifItalic, fontSize: 16, color: c.sepia, paddingTop: 24 }}
          >
            {loading ? 'Chargement…' : 'Ce membre est introuvable.'}
          </Text>
        ) : (
          <>
            <View className="items-center" style={{ gap: 14, paddingTop: 12 }}>
              <Avatar
                initials={member.initials}
                color={member.color}
                photo={member.avatarUrl}
                size={112}
              />
              <Text style={{ fontFamily: f.serif, fontSize: 30, color: c.ivory }}>
                {member.displayName}
              </Text>
              {/* Sa couleur : celle de ses courbes dans l'Oracle et de ses
                  marques partout ailleurs — c'est comme ça qu'on le reconnaît. */}
              <View style={{ width: 28, height: 2, backgroundColor: member.color }} />
            </View>

            <View>
              <SectionTitle
                label="LIENS PARTAGÉS"
                hint={member.links.length > 0 ? `${member.links.length}` : undefined}
              />
              {member.links.length > 0 ? (
                <SharedLinks links={member.links} />
              ) : (
                <Text
                  style={{
                    fontFamily: f.serifItalic,
                    fontSize: 15,
                    color: c.sepia,
                    paddingVertical: 14,
                  }}
                >
                  {isMe
                    ? 'Vous ne partagez encore aucun lien.'
                    : `${member.displayName} ne partage encore aucun lien.`}
                </Text>
              )}
            </View>

            {isMe ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/profile')}
                style={{
                  alignItems: 'center',
                  paddingVertical: 12,
                  borderRadius: radius.button,
                  borderWidth: 1,
                  borderColor: c.borderLift,
                }}
              >
                <Text
                  style={{
                    fontFamily: f.labelMed,
                    fontSize: 10,
                    letterSpacing: 1.8,
                    color: c.gold,
                  }}
                >
                  MODIFIER MON PROFIL
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
