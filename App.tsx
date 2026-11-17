/**
 * Lab3App - Practical Exercise: Using Sensors in React Native with Turbo Modules
 *
 * Screen 1 - NFC Tag Reader : Đọc dữ liệu từ thẻ NFC
 * Screen 2 - Compass        : La bàn sử dụng Magnetometer
 *
 * @format
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  DeviceEventEmitter,
  Dimensions,
  LogBox,
  NativeModules,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

LogBox.ignoreAllLogs();

// ─── Types ───────────────────────────────────────────────────────────────────

interface NFCRecord {
  tnf?: number;
  type?: string;
  text?: string;
  rawPayloadHex?: string;
}

interface NFCTagInfo {
  id: string;
  technologies: string[];
  records: NFCRecord[];
  hasNdefData: boolean;
  action: string;
}

interface NFCModuleType {
  isNFCSupported: () => Promise<boolean>;
  isNFCEnabled: () => Promise<boolean>;
  startNFCScan: () => Promise<boolean>;
  stopNFCScan: () => Promise<boolean>;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
}

interface MagnetometerModuleType {
  isMagnetometerAvailable: () => Promise<boolean>;
  startMagnetometerUpdates: () => Promise<boolean>;
  stopMagnetometerUpdates: () => Promise<boolean>;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
}

interface MagnetometerData {
  azimuth: number;
  pitch: number;
  roll: number;
  x: number;
  y: number;
  z: number;
}

// ─── Native Module References ─────────────────────────────────────────────────

const { NFCModule, MagnetometerModule } = NativeModules as {
  NFCModule?: NFCModuleType;
  MagnetometerModule?: MagnetometerModuleType;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const COMPASS_SIZE = SCREEN_W * 0.78;

/** Convert azimuth degrees to compass direction label */
function getDirectionLabel(azimuth: number): string {
  if (azimuth >= 337.5 || azimuth < 22.5) return 'N';
  if (azimuth < 67.5) return 'NE';
  if (azimuth < 112.5) return 'E';
  if (azimuth < 157.5) return 'SE';
  if (azimuth < 202.5) return 'S';
  if (azimuth < 247.5) return 'SW';
  if (azimuth < 292.5) return 'W';
  return 'NW';
}

/** Convert azimuth degrees to Vietnamese direction name */
function getDirectionName(azimuth: number): string {
  if (azimuth >= 337.5 || azimuth < 22.5) return 'Hướng Bắc';
  if (azimuth < 67.5) return 'Đông Bắc';
  if (azimuth < 112.5) return 'Hướng Đông';
  if (azimuth < 157.5) return 'Đông Nam';
  if (azimuth < 202.5) return 'Hướng Nam';
  if (azimuth < 247.5) return 'Tây Nam';
  if (azimuth < 292.5) return 'Hướng Tây';
  return 'Tây Bắc';
}

// ─── App Component ────────────────────────────────────────────────────────────

type TabType = 'nfc' | 'compass';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('nfc');

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0F4FF" />

      {/* Top Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'nfc' && styles.tabItemActive]}
          onPress={() => setActiveTab('nfc')}
          activeOpacity={0.8}>
          <Text style={[styles.tabText, activeTab === 'nfc' && styles.tabTextActive]}>
            📡  NFC Reader
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'compass' && styles.tabItemActive]}
          onPress={() => setActiveTab('compass')}
          activeOpacity={0.8}>
          <Text style={[styles.tabText, activeTab === 'compass' && styles.tabTextActive]}>
            🧭  Compass
          </Text>
        </TouchableOpacity>
      </View>

      {/* Screen Content */}
      {activeTab === 'nfc' ? <NFCScreen /> : <CompassScreen />}
    </SafeAreaView>
  );
}

// ─── NFC Screen ───────────────────────────────────────────────────────────────

function NFCScreen() {
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [tagInfo, setTagInfo] = useState<NFCTagInfo | null>(null);
  const [statusMsg, setStatusMsg] = useState('Nhấn "Bắt đầu quét" để kích hoạt NFC');
  const [errorMsg, setErrorMsg] = useState('');

  // Pulse animation for scanning indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const startPulse = useCallback(() => {
    pulseAnimRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    pulseAnimRef.current.start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnimRef.current?.stop();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  // Check NFC on mount
  useEffect(() => {
    (async () => {
      if (!NFCModule) {
        setIsSupported(false);
        setErrorMsg('NFCModule không tìm thấy. Hãy build lại ứng dụng.');
        return;
      }
      const supported = await NFCModule.isNFCSupported();
      setIsSupported(supported);
      if (supported) {
        const enabled = await NFCModule.isNFCEnabled();
        setIsEnabled(enabled);
        if (!enabled) {
          setStatusMsg('NFC chưa được bật. Vào Settings → Kết nối → NFC để bật.');
        }
      } else {
        setStatusMsg('Thiết bị không hỗ trợ NFC.');
      }
    })();
  }, []);

  // Listen for NFC events
  useEffect(() => {
    const tagSub = DeviceEventEmitter.addListener('NFCTagDetected', (data: NFCTagInfo) => {
      setTagInfo(data);
      setStatusMsg('✅ Đã đọc thẻ NFC thành công!');
      setErrorMsg('');
    });

    const statusSub = DeviceEventEmitter.addListener('NFCStatus', (data: { status: string; message: string }) => {
      setStatusMsg(data.message);
    });

    const errorSub = DeviceEventEmitter.addListener('NFCError', (data: { code: string; message: string }) => {
      setErrorMsg(`Lỗi: ${data.message}`);
    });

    return () => {
      tagSub.remove();
      statusSub.remove();
      errorSub.remove();
    };
  }, []);

  const handleStartScan = useCallback(async () => {
    if (!NFCModule) return;
    setTagInfo(null);
    setErrorMsg('');
    try {
      await NFCModule.startNFCScan();
      setIsScanning(true);
      startPulse();
    } catch (e: any) {
      setErrorMsg(`Không thể bắt đầu quét: ${e.message}`);
    }
  }, [startPulse]);

  const handleStopScan = useCallback(async () => {
    if (!NFCModule) return;
    try {
      await NFCModule.stopNFCScan();
    } catch (_) {}
    setIsScanning(false);
    stopPulse();
    setStatusMsg('NFC đã dừng. Nhấn "Bắt đầu quét" để tiếp tục.');
  }, [stopPulse]);

  // Auto-stop scanning when tag is detected
  useEffect(() => {
    if (tagInfo) {
      setIsScanning(false);
      stopPulse();
      NFCModule?.stopNFCScan().catch(() => {});
    }
  }, [tagInfo, stopPulse]);

  return (
    <ScrollView contentContainerStyle={styles.screenContainer} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>NFC Tag Reader</Text>
        <Text style={styles.screenSubtitle}>Exercise 1 – Turbo Native Module</Text>
      </View>

      {/* NFC Support Status */}
      <View style={styles.statusRow}>
        <StatusBadge
          label="Hỗ trợ NFC"
          value={isSupported === null ? '...' : isSupported ? 'Có' : 'Không'}
          color={isSupported ? '#22C55E' : '#EF4444'}
        />
        <StatusBadge
          label="NFC bật"
          value={isEnabled === null ? '...' : isEnabled ? 'Có' : 'Không'}
          color={isEnabled ? '#22C55E' : '#EF4444'}
        />
      </View>

      {/* Scan indicator */}
      <View style={styles.nfcIconContainer}>
        <Animated.View style={[styles.nfcIconOuter, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.nfcIconInner}>
            <Text style={styles.nfcIconText}>📡</Text>
          </View>
        </Animated.View>
        <Text style={styles.statusText}>{statusMsg}</Text>
        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
      </View>

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, isScanning && styles.btnDisabled]}
          onPress={handleStartScan}
          disabled={isScanning || !isSupported || !isEnabled}
          activeOpacity={0.8}>
          <Text style={styles.btnText}>▶  Bắt đầu quét</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, !isScanning && styles.btnDisabled]}
          onPress={handleStopScan}
          disabled={!isScanning}
          activeOpacity={0.8}>
          <Text style={[styles.btnText, { color: '#374151' }]}>■  Dừng</Text>
        </TouchableOpacity>
      </View>

      {/* Tag Info Card */}
      {tagInfo && <NFCTagCard tag={tagInfo} />}
    </ScrollView>
  );
}

function StatusBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeLabel}>{label}</Text>
      <Text style={[styles.badgeValue, { color }]}>{value}</Text>
    </View>
  );
}

function NFCTagCard({ tag }: { tag: NFCTagInfo }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>📋 Thông tin thẻ NFC</Text>

      <InfoRow label="Tag ID" value={tag.id} mono />
      <InfoRow label="Hành động" value={tag.action} />
      <InfoRow label="Có dữ liệu NDEF" value={tag.hasNdefData ? 'Có' : 'Không'} />

      <Text style={styles.cardSubtitle}>Công nghệ hỗ trợ:</Text>
      {tag.technologies.map((tech, i) => (
        <Text key={i} style={styles.techItem}>• {tech}</Text>
      ))}

      {tag.hasNdefData && tag.records.length > 0 && (
        <>
          <Text style={styles.cardSubtitle}>Nội dung NDEF ({tag.records.length} record):</Text>
          {tag.records.map((rec, i) => (
            <View key={i} style={styles.recordBox}>
              <Text style={styles.recordIndex}>Record #{i + 1}</Text>
              {rec.type ? <InfoRow label="Loại" value={rec.type} /> : null}
              {rec.text ? <InfoRow label="Nội dung" value={rec.text} /> : null}
              {rec.rawPayloadHex ? (
                <InfoRow label="Hex" value={rec.rawPayloadHex.substring(0, 48) + (rec.rawPayloadHex.length > 48 ? '…' : '')} mono />
              ) : null}
            </View>
          ))}
        </>
      )}

      {!tag.hasNdefData && (
        <Text style={styles.noDataText}>
          Thẻ này không chứa dữ liệu NDEF, nhưng đã được nhận diện thành công qua Tag ID.
        </Text>
      )}
    </View>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}:</Text>
      <Text style={[styles.infoValue, mono && styles.monoText]}>{value}</Text>
    </View>
  );
}

// ─── Compass Screen ───────────────────────────────────────────────────────────

function CompassScreen() {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [azimuth, setAzimuth] = useState(0);
  const [rawData, setRawData] = useState<{ x: number; y: number; z: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Animated value for the compass needle rotation
  const rotationAnim = useRef(new Animated.Value(0)).current;
  const prevAzimuth = useRef(0);

  // Smooth rotate the compass dial to new azimuth
  const rotateTo = useCallback(
    (newAzimuth: number) => {
      let delta = newAzimuth - prevAzimuth.current;
      // Shortest path: prevent spinning 350° when it should go -10°
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      const target = prevAzimuth.current + delta;
      prevAzimuth.current = target;

      Animated.spring(rotationAnim, {
        toValue: target,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }).start();
    },
    [rotationAnim],
  );

  // Check availability
  useEffect(() => {
    (async () => {
      if (!MagnetometerModule) {
        setIsAvailable(false);
        setErrorMsg('MagnetometerModule không tìm thấy. Hãy build lại ứng dụng.');
        return;
      }
      const avail = await MagnetometerModule.isMagnetometerAvailable();
      setIsAvailable(avail);
      if (!avail) setErrorMsg('Thiết bị không có cảm biến từ kế hoặc gia tốc kế.');
    })();
  }, []);

  // Listen to magnetometer events
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'MagnetometerUpdate',
      (data: MagnetometerData) => {
        setAzimuth(Math.round(data.azimuth));
        setRawData({ x: data.x, y: data.y, z: data.z });
        rotateTo(data.azimuth);
      },
    );
    return () => sub.remove();
  }, [rotateTo]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      MagnetometerModule?.stopMagnetometerUpdates().catch(() => {});
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (!MagnetometerModule) return;
    setErrorMsg('');
    try {
      await MagnetometerModule.startMagnetometerUpdates();
      setIsRunning(true);
    } catch (e: any) {
      setErrorMsg(`Lỗi: ${e.message}`);
    }
  }, []);

  const handleStop = useCallback(async () => {
    if (!MagnetometerModule) return;
    try {
      await MagnetometerModule.stopMagnetometerUpdates();
    } catch (_) {}
    setIsRunning(false);
  }, []);

  // The compass DIAL rotates around so that "N" always points to actual North.
  // The needle graphic stays fixed at top.
  const dialRotation = rotationAnim.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg'],
    extrapolate: 'extend',
  });

  const directionLabel = getDirectionLabel(azimuth);
  const directionName = getDirectionName(azimuth);

  return (
    <ScrollView contentContainerStyle={styles.screenContainer} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Compass</Text>
        <Text style={styles.screenSubtitle}>Exercise 2 – Magnetometer Module</Text>
      </View>

      {/* Availability badge */}
      <View style={styles.statusRow}>
        <StatusBadge
          label="Từ kế"
          value={isAvailable === null ? '...' : isAvailable ? 'Có sẵn' : 'Không'}
          color={isAvailable ? '#22C55E' : '#EF4444'}
        />
        <StatusBadge
          label="Trạng thái"
          value={isRunning ? 'Đang chạy' : 'Dừng'}
          color={isRunning ? '#22C55E' : '#6B7280'}
        />
      </View>

      {errorMsg ? (
        <Text style={[styles.errorText, { marginBottom: 12 }]}>{errorMsg}</Text>
      ) : null}

      {/* ─── Compass Visual ─── */}
      <View style={styles.compassContainer}>
        {/* Outer glow ring */}
        <View style={styles.compassGlowOuter} />
        <View style={styles.compassGlowInner} />

        {/* Rotating Dial */}
        <Animated.View
          style={[
            styles.compassDial,
            { transform: [{ rotate: dialRotation }] },
          ]}>
          {/* Degree marks + cardinal labels */}
          <CompassDial />
        </Animated.View>

        {/* Fixed needle (orange dot) on West side like the reference image — actually
            represents the direction indicator at the fixed position */}
        {/* Center info (stays fixed) */}
        <View style={styles.compassCenter}>
          <Text style={styles.compassDegreeText}>{azimuth}°</Text>
          <Text style={styles.compassDirText}>{directionLabel}</Text>
        </View>

        {/* Fixed Cardinal Letters outside */}
        <Text style={[styles.cardinalFixed, styles.cardinalN]}>N</Text>
        <Text style={[styles.cardinalFixed, styles.cardinalS]}>S</Text>
        <Text style={[styles.cardinalFixed, styles.cardinalW]}>W</Text>
        <Text style={[styles.cardinalFixed, styles.cardinalE]}>E</Text>

        {/* North tick (fixed, red) */}
        <View style={styles.northTick} />

        {/* Direction dot indicator */}
        <View style={styles.dirDotContainer}>
          <Animated.View
            style={[
              styles.dirDot,
              {
                transform: [
                  { rotate: dialRotation },
                  { translateX: COMPASS_SIZE * 0.3 },
                ],
              },
            ]}
          />
        </View>
      </View>

      {/* Direction name */}
      <Text style={styles.directionName}>{directionName}</Text>

      {/* Control buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, isRunning && styles.btnDisabled]}
          onPress={handleStart}
          disabled={isRunning || !isAvailable}
          activeOpacity={0.8}>
          <Text style={styles.btnText}>▶  Bắt đầu</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, !isRunning && styles.btnDisabled]}
          onPress={handleStop}
          disabled={!isRunning}
          activeOpacity={0.8}>
          <Text style={[styles.btnText, { color: '#374151' }]}>■  Dừng</Text>
        </TouchableOpacity>
      </View>

      {/* Raw sensor data */}
      {rawData && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 Dữ liệu cảm biến thô (µT)</Text>
          <InfoRow label="X" value={rawData.x.toFixed(2)} />
          <InfoRow label="Y" value={rawData.y.toFixed(2)} />
          <InfoRow label="Z" value={rawData.z.toFixed(2)} />
          <InfoRow label="Góc Bắc" value={`${azimuth}°`} />
        </View>
      )}
    </ScrollView>
  );
}

/** Renders the compass dial tick marks and degree numbers */
function CompassDial() {
  const marks = [];
  const R = COMPASS_SIZE / 2;
  const innerR = R * 0.78;

  for (let deg = 0; deg < 360; deg += 5) {
    const isMajor = deg % 30 === 0;
    const isCardinal = deg % 90 === 0;
    const tickLen = isCardinal ? R * 0.1 : isMajor ? R * 0.07 : R * 0.045;
    const rad = (deg - 90) * (Math.PI / 180);

    const x1 = R + innerR * Math.cos(rad);
    const y1 = R + innerR * Math.sin(rad);
    const x2 = R + (innerR + tickLen) * Math.cos(rad);
    const y2 = R + (innerR + tickLen) * Math.sin(rad);

    marks.push(
      <View
        key={`tick-${deg}`}
        style={{
          position: 'absolute',
          left: x1,
          top: y1,
          width: x2 - x1 || 0.5,
          height: Math.abs(y2 - y1) || (isCardinal ? 2 : 1),
          backgroundColor: isCardinal ? '#6366F1' : isMajor ? '#94A3B8' : '#CBD5E1',
          transform: [{ rotate: `${deg}deg` }],
        }}
      />,
    );

    // Degree numbers every 30°
    if (isMajor && !isCardinal) {
      const textR = innerR + tickLen + R * 0.07;
      const tx = R + textR * Math.cos(rad) - 10;
      const ty = R + textR * Math.sin(rad) - 7;
      marks.push(
        <Text
          key={`label-${deg}`}
          style={{
            position: 'absolute',
            left: tx,
            top: ty,
            fontSize: 9,
            color: '#94A3B8',
            width: 24,
            textAlign: 'center',
          }}>
          {deg}°
        </Text>,
      );
    }
  }

  return <View style={{ width: COMPASS_SIZE, height: COMPASS_SIZE }}>{marks}</View>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F0F4FF',
  },

  // ── Tab Bar ──
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    padding: 4,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabItemActive: {
    backgroundColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },

  // ── Screen ──
  screenContainer: {
    padding: 16,
    paddingBottom: 32,
    alignItems: 'center',
  },
  screenHeader: {
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: 0.5,
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },

  // ── Status Row ──
  statusRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  badge: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  badgeLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 2,
  },
  badgeValue: {
    fontSize: 14,
    fontWeight: '700',
  },

  // ── NFC ──
  nfcIconContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  nfcIconOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(99,102,241,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  nfcIconInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(99,102,241,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nfcIconText: {
    fontSize: 34,
  },
  statusText: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
    maxWidth: 280,
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 300,
  },

  // ── Buttons ──
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
    width: '100%',
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  btnSecondary: {
    backgroundColor: '#E2E8F0',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── NFC Card ──
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 10,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6366F1',
    marginTop: 10,
    marginBottom: 4,
  },
  techItem: {
    fontSize: 13,
    color: '#374151',
    marginLeft: 8,
    marginVertical: 1,
  },
  infoRow: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  infoLabel: {
    fontSize: 13,
    color: '#6B7280',
    width: 100,
    flexShrink: 0,
  },
  infoValue: {
    fontSize: 13,
    color: '#1E293B',
    flex: 1,
    flexWrap: 'wrap',
  },
  monoText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#374151',
  },
  recordBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
  },
  recordIndex: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366F1',
    marginBottom: 4,
  },
  noDataText: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 8,
  },

  // ── Compass ──
  compassContainer: {
    width: COMPASS_SIZE + 60,
    height: COMPASS_SIZE + 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
    position: 'relative',
  },
  compassGlowOuter: {
    position: 'absolute',
    width: COMPASS_SIZE + 50,
    height: COMPASS_SIZE + 50,
    borderRadius: (COMPASS_SIZE + 50) / 2,
    backgroundColor: 'rgba(99,102,241,0.06)',
  },
  compassGlowInner: {
    position: 'absolute',
    width: COMPASS_SIZE + 20,
    height: COMPASS_SIZE + 20,
    borderRadius: (COMPASS_SIZE + 20) / 2,
    backgroundColor: 'rgba(99,102,241,0.09)',
  },
  compassDial: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    borderRadius: COMPASS_SIZE / 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  compassCenter: {
    position: 'absolute',
    width: COMPASS_SIZE * 0.44,
    height: COMPASS_SIZE * 0.44,
    borderRadius: (COMPASS_SIZE * 0.44) / 2,
    backgroundColor: '#F8FAFC',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compassDegreeText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E293B',
  },
  compassDirText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6366F1',
    marginTop: -2,
  },

  // Fixed cardinal letters
  cardinalFixed: {
    position: 'absolute',
    fontSize: 15,
    fontWeight: '800',
    color: '#374151',
  },
  cardinalN: {
    top: 4,
    color: '#EF4444',
    fontSize: 16,
  },
  cardinalS: {
    bottom: 4,
  },
  cardinalW: {
    left: 8,
  },
  cardinalE: {
    right: 8,
  },
  northTick: {
    position: 'absolute',
    top: 32,
    width: 2,
    height: 12,
    backgroundColor: '#EF4444',
    borderRadius: 1,
  },
  dirDotContainer: {
    position: 'absolute',
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dirDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#F97316',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 6,
  },
  directionName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    marginTop: 4,
    marginBottom: 16,
  },
});
