import { router } from 'expo-router';
import {
  BatteryCharging,
  Fuel,
  CircleAlert,
  Wrench,
  CarFront,
  ChevronRight,
} from 'lucide-react-native';
import { Pressable, View, StyleSheet, Text } from 'react-native';

import { useSession } from '@/components/providers/session-provider';
import {
  AppScreen,
  DetailHeader,
  PENCIL,
  SurfaceCard,
} from '@/components/pencil-ui';
import { resolveAlerts, type AlertId } from '@/lib/autosense-data';
import { backOrFallback } from '@/lib/navigation';

const FALLBACK_ALERTS: AlertId[] = ['battery', 'brakes', 'oil', 'tire', 'efficiency'];

function getAlertIcon(id: AlertId) {
  switch (id) {
    case 'battery':
      return <BatteryCharging color={PENCIL.warning} size={18} strokeWidth={2.1} />;
    case 'brakes':
      return <Wrench color={PENCIL.warning} size={18} strokeWidth={2.1} />;
    case 'oil':
      return <CarFront color={PENCIL.warning} size={18} strokeWidth={2.1} />;
    case 'tire':
      return <CircleAlert color={PENCIL.accent} size={18} strokeWidth={2.1} />;
    case 'efficiency':
      return <Fuel color={PENCIL.success} size={18} strokeWidth={2.1} />;
  }
}

function getAlertValueColor(value: string) {
  switch (value) {
    case 'Crítica':
      return PENCIL.danger;
    case 'Media':
      return PENCIL.warning;
    case 'Baja':
      return PENCIL.accent;
    default:
      return PENCIL.success;
  }
}

export default function AlertsScreen() {
  const { profile } = useSession();
  const resolvedAlerts = resolveAlerts(profile?.alerts);
  const alerts = FALLBACK_ALERTS.map((id) => {
    const alert = resolvedAlerts[id];

    return {
      id,
      icon: getAlertIcon(id),
      subtitle: alert?.subtitle ?? 'Sin novedades',
      title: alert?.title ?? id,
      value: alert?.value ?? 'OK',
      valueColor: getAlertValueColor(alert?.value ?? 'OK'),
    };
  });

  return (
    <AppScreen
      contentTopPadding={8}
      header={(
        <DetailHeader
          onBack={() => backOrFallback('/home')}
          title="Avisos"
        />
      )}
    >
      <View style={styles.page}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Lista de alertas</Text>
          <Text style={styles.listCaption}>Toca una tarjeta para ver detalles</Text>
        </View>

        <View style={styles.alertList}>
          {alerts.map((alert) => (
            <SurfaceCard key={alert.id} padding={0}>
              <Pressable
                onPress={() =>
                  router.push(
                    alert.id === 'efficiency'
                      ? '/home/efficiency'
                      : {
                          pathname: '/home/alerts/[slug]',
                          params: { slug: alert.id },
                        },
                  )
                }
                style={({ pressed }) => [
                  styles.alertCard,
                  pressed ? styles.alertCardPressed : null,
                ]}
              >
                <View style={styles.alertRow}>
                  <View style={styles.alertLeading}>
                    <View style={styles.alertIcon}>{alert.icon}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertTitle}>{alert.title}</Text>
                      <Text style={styles.alertSubtitle}>{alert.subtitle}</Text>
                    </View>
                  </View>

                  <View style={styles.alertTrailing}>
                    <Text style={[styles.alertValue, { color: alert.valueColor }]}>
                      {alert.value}
                    </Text>
                    <ChevronRight color="#667085" size={18} strokeWidth={2} />
                  </View>
                </View>
              </Pressable>
            </SurfaceCard>
          ))}
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: 14,
  },
  listHeader: {
    gap: 4,
  },
  listTitle: {
    color: PENCIL.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  listCaption: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  alertList: {
    gap: 10,
  },
  alertCard: {
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  alertCardPressed: {
    opacity: 0.92,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  alertLeading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  alertIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: PENCIL.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: {
    color: PENCIL.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
  },
  alertSubtitle: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    marginTop: 2,
  },
  alertTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alertValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
});
