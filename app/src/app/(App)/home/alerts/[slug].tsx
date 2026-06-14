import { type ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Card } from 'heroui-native';
import {
  BatteryCharging,
  CircleAlert,
  Fuel,
  ShieldCheck,
  Thermometer,
  TimerReset,
  TriangleAlert,
  Wrench,
} from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import {
  AppScreen,
  CompactMetricCard,
  DetailHeader,
  IconBubble,
  PENCIL,
  ProgressBars,
  SurfaceCard,
} from '@/components/pencil-ui';
import { backOrFallback } from '@/lib/navigation';

type AlertSlug = 'battery' | 'brakes' | 'oil' | 'tire';

type AlertSectionItem = {
  title: string;
  subtitle: string;
  icon: ReactNode;
  iconBackground: string;
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

const ALERTS: Record<AlertSlug, AlertConfig> = {
  battery: {
    title: 'Batería',
    heroLabel: 'Causa detectada',
    heroValue: '68%',
    heroScale: 'salud',
    heroDescription: 'Voltaje por debajo del rango ideal.',
    heroIcon: <BatteryCharging color={PENCIL.warning} size={19} strokeWidth={2.2} />,
    heroIconBackground: PENCIL.warningSoft,
    progressValues: [1, 1, 1, 0, 0],
    progressColor: PENCIL.warning,
    metrics: [
      {
        title: 'Voltaje',
        value: '12.1V',
        subtitle: 'Bajo',
        icon: <BatteryCharging color={PENCIL.warning} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.warningSoft,
        iconColor: PENCIL.warning,
      },
      {
        title: 'Arranques',
        value: '3',
        subtitle: 'Fallidos',
        icon: <TriangleAlert color={PENCIL.warning} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.warningSoft,
        iconColor: PENCIL.warning,
      },
      {
        title: 'Salud',
        value: '68%',
        subtitle: 'Estimación',
        icon: <ShieldCheck color={PENCIL.accent} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.accentSoft,
        iconColor: PENCIL.accent,
      },
      {
        title: 'Urgencia',
        value: '48h',
        subtitle: 'Máximo',
        icon: <TimerReset color={PENCIL.danger} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.dangerSoft,
        iconColor: PENCIL.danger,
      },
    ],
    detailTitle: 'Detalles',
    detailItems: [
      {
        title: 'Diagnóstico principal',
        subtitle: 'La batería cayó por debajo del nivel habitual durante varios arranques y puede fallar en ciclos cortos.',
        icon: <CircleAlert color={PENCIL.warning} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.warningSoft,
      },
      {
        title: 'Causa probable',
        subtitle: 'El acumulador parece estar perdiendo capacidad útil o carga estable bajo demanda.',
        icon: <TriangleAlert color={PENCIL.danger} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.dangerSoft,
      },
    ],
    followUpTitle: 'Seguimiento recomendado',
    followUpItems: [
      {
        title: 'Acción sugerida',
        subtitle: 'Haz chequeo eléctrico y prueba de carga en las próximas 48 horas.',
        icon: <Wrench color={PENCIL.accent} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.accentSoft,
      },
      {
        title: 'Uso temporal',
        subtitle: 'Evita dejar luces o accesorios activos con el motor apagado hasta revisarla.',
        icon: <ShieldCheck color={PENCIL.success} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.successSoft,
      },
    ],
  },
  brakes: {
    title: 'Frenos',
    heroLabel: 'Causa detectada',
    heroValue: '83%',
    heroScale: 'desgaste',
    heroDescription: 'Desgaste alto detectado en pastillas.',
    heroIcon: <Wrench color={PENCIL.danger} size={19} strokeWidth={2.2} />,
    heroIconBackground: PENCIL.dangerSoft,
    progressValues: [1, 1, 1, 1, 0],
    progressColor: PENCIL.warning,
    metrics: [
      {
        title: 'Desgaste',
        value: '83%',
        subtitle: 'Pastillas',
        icon: <Wrench color={PENCIL.danger} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.dangerSoft,
        iconColor: PENCIL.danger,
      },
      {
        title: 'Temperatura',
        value: '68°C',
        subtitle: 'En uso',
        icon: <Thermometer color={PENCIL.warning} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.warningSoft,
        iconColor: PENCIL.warning,
      },
      {
        title: 'Respuesta',
        value: '41ms',
        subtitle: 'Promedio',
        icon: <ShieldCheck color={PENCIL.accent} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.accentSoft,
        iconColor: PENCIL.accent,
      },
      {
        title: 'Servicio',
        value: 'Alta',
        subtitle: 'Prioridad',
        icon: <CircleAlert color={PENCIL.danger} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.dangerSoft,
        iconColor: PENCIL.danger,
      },
    ],
    detailTitle: 'Detalles',
    detailItems: [
      {
        title: 'Diagnóstico principal',
        subtitle: 'El sistema muestra mayor desgaste y una respuesta de frenado menos consistente en ciudad.',
        icon: <CircleAlert color={PENCIL.warning} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.warningSoft,
      },
      {
        title: 'Causa probable',
        subtitle: 'El calor y el uso urbano continuo pueden estar acelerando el desgaste del conjunto.',
        icon: <Thermometer color={PENCIL.warning} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.warningSoft,
      },
    ],
    followUpTitle: 'Seguimiento recomendado',
    followUpItems: [
      {
        title: 'Acción sugerida',
        subtitle: 'Programa revisión de pastillas, discos y líquido antes del próximo fin de semana.',
        icon: <Wrench color={PENCIL.accent} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.accentSoft,
      },
      {
        title: 'Revisión de uso',
        subtitle: 'Si escuchas ruido o vibración al frenar, reduce conducción hasta el servicio.',
        icon: <ShieldCheck color={PENCIL.success} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.successSoft,
      },
    ],
  },
  oil: {
    title: 'Aceite',
    heroLabel: 'Causa detectada',
    heroValue: '76%',
    heroScale: 'estado',
    heroDescription: 'Servicio preventivo cercano.',
    heroIcon: <Fuel color={PENCIL.warning} size={19} strokeWidth={2.2} />,
    heroIconBackground: PENCIL.warningSoft,
    progressValues: [1, 1, 1, 1, 0],
    progressColor: PENCIL.warning,
    metrics: [
      {
        title: 'Presión',
        value: '29 psi',
        subtitle: 'Normal',
        icon: <Fuel color={PENCIL.warning} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.warningSoft,
        iconColor: PENCIL.warning,
      },
      {
        title: 'Kilometraje',
        value: '4,800',
        subtitle: 'Desde cambio',
        icon: <TimerReset color={PENCIL.warning} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.warningSoft,
        iconColor: PENCIL.warning,
      },
      {
        title: 'Viscosidad',
        value: '76%',
        subtitle: 'Correcta',
        icon: <ShieldCheck color={PENCIL.accent} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.accentSoft,
        iconColor: PENCIL.accent,
      },
      {
        title: 'Servicio',
        value: 'Próximo',
        subtitle: 'Sugerido',
        icon: <CircleAlert color={PENCIL.warning} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.warningSoft,
        iconColor: PENCIL.warning,
      },
    ],
    detailTitle: 'Detalles',
    detailItems: [
      {
        title: 'Diagnóstico principal',
        subtitle: 'El aceite sigue estable, pero ya entra en el tramo final del ciclo recomendado.',
        icon: <TimerReset color={PENCIL.warning} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.warningSoft,
      },
      {
        title: 'Causa probable',
        subtitle: 'El kilometraje acumulado desde el último cambio es la razón principal del aviso.',
        icon: <ShieldCheck color={PENCIL.success} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.successSoft,
      },
    ],
    followUpTitle: 'Seguimiento recomendado',
    followUpItems: [
      {
        title: 'Nivel estable',
        subtitle: 'No se detectan fugas ni caídas bruscas de presión en esta lectura.',
        icon: <ShieldCheck color={PENCIL.success} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.successSoft,
      },
      {
        title: 'Acción sugerida',
        subtitle: 'Prepara cambio de aceite y filtro en el próximo mantenimiento preventivo.',
        icon: <Wrench color={PENCIL.accent} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.accentSoft,
      },
    ],
  },
  tire: {
    title: 'Llantas',
    heroLabel: 'Causa detectada',
    heroValue: '28 psi',
    heroScale: 'delantera',
    heroDescription: 'Presión baja detectada.',
    heroIcon: <CircleAlert color={PENCIL.accent} size={19} strokeWidth={2.2} />,
    heroIconBackground: PENCIL.accentSoft,
    progressValues: [1, 1, 0, 0, 0],
    progressColor: PENCIL.accent,
    metrics: [
      {
        title: 'Presión',
        value: '28 psi',
        subtitle: 'Delantera',
        icon: <CircleAlert color={PENCIL.accent} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.accentSoft,
        iconColor: PENCIL.accent,
      },
      {
        title: 'Temperatura',
        value: '41°C',
        subtitle: 'Estable',
        icon: <Thermometer color={PENCIL.warning} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.warningSoft,
        iconColor: PENCIL.warning,
      },
      {
        title: 'Alineación',
        value: '92%',
        subtitle: 'Correcta',
        icon: <ShieldCheck color={PENCIL.success} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.successSoft,
        iconColor: PENCIL.success,
      },
      {
        title: 'Rotación',
        value: '12 días',
        subtitle: 'Próxima',
        icon: <Wrench color={PENCIL.accent} size={16} strokeWidth={2.2} />,
        iconBackground: PENCIL.accentSoft,
        iconColor: PENCIL.accent,
      },
    ],
    detailTitle: 'Detalles',
    detailItems: [
      {
        title: 'Diagnóstico principal',
        subtitle: 'La presión de la llanta delantera izquierda cayó por debajo del rango ideal para este recorrido.',
        icon: <CircleAlert color={PENCIL.accent} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.accentSoft,
      },
      {
        title: 'Causa probable',
        subtitle: 'La diferencia puede venir de una fuga lenta o pérdida de presión por temperatura nocturna.',
        icon: <TriangleAlert color={PENCIL.warning} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.warningSoft,
      },
    ],
    followUpTitle: 'Seguimiento recomendado',
    followUpItems: [
      {
        title: 'Acción sugerida',
        subtitle: 'Corrige presión, revisa la válvula y confirma desgaste en el borde interior.',
        icon: <Wrench color={PENCIL.success} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.successSoft,
      },
      {
        title: 'Siguiente revisión',
        subtitle: 'Verifica la lectura otra vez después de inflarla y antes del próximo trayecto largo.',
        icon: <ShieldCheck color={PENCIL.accent} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.accentSoft,
      },
    ],
  },
};

export default function AlertDetailScreen() {
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = typeof params.slug === 'string' ? params.slug : 'battery';
  const alert = slug in ALERTS ? ALERTS[slug as AlertSlug] : ALERTS.battery;

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
