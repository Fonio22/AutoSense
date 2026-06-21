import { type ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Card } from 'heroui-native';
import {
  BatteryCharging,
  CircleAlert,
  ShieldCheck,
  Thermometer,
  TimerReset,
  Wrench,
} from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/components/providers/session-provider';
import {
  AppScreen,
  CompactMetricCard,
  DetailHeader,
  IconBubble,
  PENCIL,
  ProgressBars,
  SurfaceCard,
} from '@/components/pencil-ui';
import {
  resolveAlerts,
  type AlertId,
  type AutoSenseAlertSnapshot,
} from '@/lib/autosense-data';
import { backOrFallback } from '@/lib/navigation';

type AlertSlug = 'battery' | 'brakes' | 'oil' | 'tire';

type AlertSectionItem = {
  title: string;
  subtitle: string;
  icon: ReactNode;
  iconBackground: string;
};

type AlertBase = {
  title: string;
  heroIcon: ReactNode;
  heroIconBackground: string;
};

type AlertConfig = {
  title: string;
  heroLabel: string;
  heroValue: string;
  heroScale: string;
  heroDescription: string;
  heroIcon: ReactNode;
  heroIconBackground: string;
  progressValues: number[];
  progressColor: string;
  metrics: {
    title: string;
    value: string;
    subtitle?: string;
    icon: ReactNode;
    iconBackground: string;
    iconColor: string;
  }[];
  detailTitle: string;
  detailItems: AlertSectionItem[];
  followUpTitle: string;
  followUpItems: AlertSectionItem[];
};

const ALERTS: Record<AlertSlug, AlertBase> = {
  battery: {
    title: 'Batería',
    heroIcon: <BatteryCharging color={PENCIL.warning} size={19} strokeWidth={2.2} />,
    heroIconBackground: PENCIL.warningSoft,
  },
  brakes: {
    title: 'Frenos',
    heroIcon: <Wrench color={PENCIL.warning} size={19} strokeWidth={2.2} />,
    heroIconBackground: PENCIL.warningSoft,
  },
  oil: {
    title: 'Temperatura',
    heroIcon: <Thermometer color={PENCIL.warning} size={19} strokeWidth={2.2} />,
    heroIconBackground: PENCIL.warningSoft,
  },
  tire: {
    title: 'Llantas',
    heroIcon: <CircleAlert color={PENCIL.accent} size={19} strokeWidth={2.2} />,
    heroIconBackground: PENCIL.accentSoft,
  },
};

function progressColorForAlert(alert: AutoSenseAlertSnapshot) {
  if (alert.tone === 'danger') {
    return PENCIL.danger;
  }
  if (alert.tone === 'warning') {
    return PENCIL.warning;
  }
  if (alert.tone === 'accent') {
    return PENCIL.accent;
  }
  return PENCIL.success;
}

function buildLiveAlertConfig(
  base: AlertBase,
  snapshot: AutoSenseAlertSnapshot,
): AlertConfig {
  const isOk = snapshot.value === 'OK';
  const color = progressColorForAlert(snapshot);
  const background = isOk ? PENCIL.successSoft : base.heroIconBackground;
  const statusMetric = {
    title: 'Estado',
    value: snapshot.value,
    subtitle: isOk ? 'Sin aviso' : 'Activo',
    icon: isOk
      ? <ShieldCheck color={PENCIL.success} size={16} strokeWidth={2.2} />
      : <CircleAlert color={color} size={16} strokeWidth={2.2} />,
    iconBackground: isOk ? PENCIL.successSoft : background,
    iconColor: color,
  };

  return {
    title: snapshot.title || base.title,
    heroLabel: isOk ? 'Estado actual' : 'Aviso detectado',
    heroValue: snapshot.value,
    heroScale: isOk ? 'lectura' : 'estado',
    heroDescription: snapshot.subtitle,
    heroIcon: isOk
      ? <ShieldCheck color={PENCIL.success} size={19} strokeWidth={2.2} />
      : base.heroIcon,
    heroIconBackground: background,
    progressValues: isOk
      ? [1, 1, 1, 1, 1]
      : snapshot.tone === 'danger'
        ? [1, 1, 1, 1, 0]
        : [1, 1, 1, 0, 0],
    progressColor: color,
    metrics: [
      statusMetric,
      {
        title: 'Fuente',
        value: snapshot.title === 'Anomalía OBD2' ? 'IA local' : 'OBD2',
        subtitle: 'AutoSense',
        icon: <CircleAlert color={PENCIL.accent} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.accentSoft,
        iconColor: PENCIL.accent,
      },
      {
        title: 'Avisos',
        value: isOk ? '0' : '1',
        subtitle: 'Activos',
        icon: <ShieldCheck color={isOk ? PENCIL.success : PENCIL.warning} size={16} strokeWidth={2.2} />,
        iconBackground: isOk ? PENCIL.successSoft : PENCIL.warningSoft,
        iconColor: isOk ? PENCIL.success : PENCIL.warning,
      },
      {
        title: 'Acción',
        value: isOk ? 'Ninguna' : 'Revisar',
        subtitle: isOk ? 'Monitorear' : 'Validar',
        icon: <TimerReset color={PENCIL.accent} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.accentSoft,
        iconColor: PENCIL.accent,
      },
    ],
    detailTitle: 'Lectura actual',
    detailItems: [
      {
        title: isOk ? 'AutoSense no detecta falla activa' : 'AutoSense detectó un aviso activo',
        subtitle: snapshot.subtitle,
        icon: isOk
          ? <ShieldCheck color={PENCIL.success} size={18} strokeWidth={2.1} />
          : <CircleAlert color={color} size={18} strokeWidth={2.1} />,
        iconBackground: isOk ? PENCIL.successSoft : background,
      },
    ],
    followUpTitle: 'Seguimiento',
    followUpItems: [
      {
        title: 'Monitoreo continuo',
        subtitle: 'La app actualizará este aviso cuando llegue nueva telemetría real desde el ESP32.',
        icon: <TimerReset color={PENCIL.accent} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.accentSoft,
      },
    ],
  };
}

export default function AlertDetailScreen() {
  const { profile } = useSession();
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = typeof params.slug === 'string' ? params.slug : 'battery';
  const alertSlug = slug in ALERTS ? slug as AlertSlug : 'battery';
  const alertSnapshot = resolveAlerts(profile?.alerts)[alertSlug as AlertId];
  const alert = buildLiveAlertConfig(ALERTS[alertSlug], alertSnapshot);

  return (
    <AppScreen
      contentTopPadding={8}
      header={<DetailHeader onBack={() => backOrFallback('/home/alerts')} title={alert.title} />}
    >
      <View style={styles.page}>
        <SurfaceCard>
          <View style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroLabel}>{alert.heroLabel}</Text>
                <View style={styles.heroValueRow}>
                  <Text style={styles.heroValue}>{alert.heroValue}</Text>
                  <Text style={styles.heroScale}>{alert.heroScale}</Text>
                </View>
                <Text style={styles.heroDescription}>{alert.heroDescription}</Text>
              </View>

              <IconBubble
                backgroundColor={alert.heroIconBackground}
                borderColor={alert.heroIconBackground}
                size={48}
              >
                {alert.heroIcon}
              </IconBubble>
            </View>

            <ProgressBars
              activeColor={alert.progressColor}
              inactiveColor="#DCEAE7"
              values={alert.progressValues}
            />
          </View>
        </SurfaceCard>

        <View style={styles.metricGrid}>
          {alert.metrics.map((metric) => (
            <CompactMetricCard
              key={metric.title}
              icon={metric.icon}
              iconBackground={metric.iconBackground}
              iconColor={metric.iconColor}
              subtitle={metric.subtitle}
              title={metric.title}
              value={metric.value}
            />
          ))}
        </View>

        <View style={styles.insightSection}>
          <Text style={styles.sectionTitle}>{alert.detailTitle}</Text>

          <View style={styles.insightStack}>
            {alert.detailItems.map((item) => (
              <Card key={item.title} className="p-0" style={styles.insightCardSurface}>
                <Card.Body className="p-0">
                  <View style={styles.insightCard}>
                    <IconBubble
                      backgroundColor={item.iconBackground}
                      borderColor={item.iconBackground}
                      size={40}
                    >
                      {item.icon}
                    </IconBubble>

                    <View style={styles.insightCopy}>
                      <Text style={styles.insightTitle}>{item.title}</Text>
                      <Text style={styles.insightSubtitle}>{item.subtitle}</Text>
                    </View>
                  </View>
                </Card.Body>
              </Card>
            ))}
          </View>
        </View>

        <View style={styles.insightSection}>
          <Text style={styles.sectionTitle}>{alert.followUpTitle}</Text>

          <View style={styles.insightStack}>
            {alert.followUpItems.map((item) => (
              <Card key={item.title} className="p-0" style={styles.insightCardSurface}>
                <Card.Body className="p-0">
                  <View style={styles.insightCard}>
                    <IconBubble
                      backgroundColor={item.iconBackground}
                      borderColor={item.iconBackground}
                      size={40}
                    >
                      {item.icon}
                    </IconBubble>

                    <View style={styles.insightCopy}>
                      <Text style={styles.insightTitle}>{item.title}</Text>
                      <Text style={styles.insightSubtitle}>{item.subtitle}</Text>
                    </View>
                  </View>
                </Card.Body>
              </Card>
            ))}
          </View>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: 14,
  },
  heroCard: {
    gap: 12,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroCopy: {
    flex: 1,
    gap: 2,
  },
  heroLabel: {
    color: PENCIL.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  heroValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  heroValue: {
    color: PENCIL.text,
    fontSize: 36,
    lineHeight: 38,
    fontWeight: '800',
  },
  heroScale: {
    color: PENCIL.muted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    marginBottom: 3,
  },
  heroDescription: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  insightSection: {
    gap: 10,
  },
  insightStack: {
    gap: 10,
  },
  sectionTitle: {
    color: PENCIL.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  insightCardSurface: {
    backgroundColor: '#FFFFFF',
    borderCurve: 'continuous',
    borderRadius: 22,
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.10), 0 2px 8px rgba(15, 23, 42, 0.05)',
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  insightCopy: {
    flex: 1,
    gap: 2,
  },
  insightTitle: {
    color: PENCIL.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  insightSubtitle: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
});
