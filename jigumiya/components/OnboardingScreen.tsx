import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';

const { width } = Dimensions.get('window');

interface Props {
  onComplete: () => void;
}

// ─── Step 1: 앱 소개 ───
function Step1({ onNext }: { onNext: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={styles.step}>
      <Animated.View style={[styles.iconCircle, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <Text style={styles.iconEmoji}>📉</Text>
      </Animated.View>
      <Animated.View style={{ opacity: fadeAnim }}>
        <Text style={styles.stepTitle}>지금이야</Text>
        <Text style={styles.stepDesc}>
          쿠팡 가격을 추적해서{'\n'}원하는 가격에 알려줘요
        </Text>
        <View style={styles.featureList}>
          <FeatureRow icon="notifications-outline" text="목표가 도달 시 푸시 알림" />
          <FeatureRow icon="analytics-outline" text="가격 변동 그래프 제공" />
          <FeatureRow icon="time-outline" text="매일 3회 자동 가격 확인" />
        </View>
      </Animated.View>
      <TouchableOpacity style={styles.primaryBtn} onPress={onNext} activeOpacity={0.8}>
        <Text style={styles.primaryBtnText}>시작하기</Text>
      </TouchableOpacity>
    </View>
  );
}

function FeatureRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureRow}>
      <Ionicons name={icon as any} size={18} color={theme.primary} />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

// ─── Step 2: 쿠팡 공유 버튼 안내 ───
function Step2({ onNext }: { onNext: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pointerY = useRef(new Animated.Value(0)).current;
  const pointerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start(() => {
      // 포인터 바운스 애니메이션
      Animated.timing(pointerOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(pointerY, { toValue: -8, duration: 500, useNativeDriver: true }),
          Animated.timing(pointerY, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]),
      ).start();
    });
  }, []);

  return (
    <View style={styles.step}>
      <Animated.View style={[styles.mockPhone, { opacity: fadeAnim }]}>
        {/* 가상 쿠팡 상품 화면 */}
        <View style={styles.mockHeader}>
          <View style={styles.mockHeaderBar} />
          <Text style={styles.mockHeaderText}>쿠팡</Text>
        </View>
        <View style={styles.mockProduct}>
          <View style={styles.mockImagePlaceholder}>
            <Ionicons name="image-outline" size={32} color="#555" />
          </View>
          <Text style={styles.mockProductName}>Apple 에어팟 프로 2세대</Text>
          <Text style={styles.mockProductPrice}>329,000원</Text>
        </View>
        {/* 공유 버튼 영역 */}
        <View style={styles.mockActionBar}>
          <View style={styles.mockActionBtn}>
            <Ionicons name="heart-outline" size={20} color="#999" />
          </View>
          <View style={styles.mockActionBtn}>
            <Ionicons name="cart-outline" size={20} color="#999" />
          </View>
          <View style={[styles.mockActionBtn, styles.mockShareBtn]}>
            <Ionicons name="share-outline" size={20} color={theme.primary} />
          </View>
        </View>
        {/* 포인터 */}
        <Animated.View style={[
          styles.pointer,
          { opacity: pointerOpacity, transform: [{ translateY: pointerY }] },
        ]}>
          <View style={styles.pointerArrow} />
          <Text style={styles.pointerText}>공유 버튼을 눌러요!</Text>
        </Animated.View>
      </Animated.View>

      <TouchableOpacity style={styles.primaryBtn} onPress={onNext} activeOpacity={0.8}>
        <Text style={styles.primaryBtnText}>다음</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 3: 공유 시트에서 지금이야 선택 ───
function Step3({ onNext }: { onNext: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const tapScale = useRef(new Animated.Value(1)).current;
  const tapOpacity = useRef(new Animated.Value(0)).current;
  const [tapped, setTapped] = useState(false);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start(() => {
      // 탭 유도 펄스 애니메이션
      Animated.loop(
        Animated.sequence([
          Animated.timing(tapOpacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
          Animated.timing(tapOpacity, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]),
      ).start();
    });
  }, []);

  const handleTap = () => {
    setTapped(true);
    Animated.sequence([
      Animated.timing(tapScale, { toValue: 0.85, duration: 100, useNativeDriver: true }),
      Animated.timing(tapScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(onNext, 400);
    });
  };

  const isIOS = Platform.OS === 'ios';

  return (
    <View style={styles.step}>
      <Animated.View style={[styles.mockShareSheet, { opacity: fadeAnim }]}>
        <View style={styles.shareSheetHandle} />
        <Text style={styles.shareSheetTitle}>
          {isIOS ? '공유' : '다음으로 공유'}
        </Text>
        <View style={styles.shareSheetGrid}>
          <ShareIcon name="메시지" icon="chatbubble" color="#34C759" />
          <ShareIcon name="카카오톡" icon="chatbubbles" color="#FEE500" />
          {/* 지금이야 아이콘 — 탭 가능 */}
          <TouchableOpacity onPress={handleTap} activeOpacity={0.7}>
            <Animated.View style={[
              styles.shareIconItem,
              { transform: [{ scale: tapScale }] },
            ]}>
              <Animated.View style={[styles.tapPulse, { opacity: tapOpacity }]} />
              <View style={[styles.shareIconCircle, { backgroundColor: tapped ? theme.primary : '#1a1a2e' }]}>
                <Text style={styles.shareAppEmoji}>📉</Text>
              </View>
              <Text style={[styles.shareIconLabel, tapped && { color: theme.primary }]}>지금이야</Text>
              {tapped && (
                <View style={styles.checkBadge}>
                  <Ionicons name="checkmark" size={12} color="#000" />
                </View>
              )}
            </Animated.View>
          </TouchableOpacity>
          <ShareIcon name="더보기" icon="ellipsis-horizontal" color="#8E8E93" />
        </View>
      </Animated.View>

      <Text style={styles.step3Hint}>
        {tapped ? '선택 완료!' : '"지금이야"를 탭해보세요'}
      </Text>
    </View>
  );
}

function ShareIcon({ name, icon, color }: { name: string; icon: string; color: string }) {
  return (
    <View style={styles.shareIconItem}>
      <View style={[styles.shareIconCircle, { backgroundColor: color }]}>
        <Ionicons name={icon as any} size={22} color="#fff" />
      </View>
      <Text style={styles.shareIconLabel}>{name}</Text>
    </View>
  );
}

// ─── Step 4: 등록 완료 + 목표가 안내 ───
function Step4({ onComplete }: { onComplete: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    Animated.spring(checkScale, { toValue: 1, friction: 4, delay: 300, useNativeDriver: true }).start();
  }, []);

  return (
    <View style={styles.step}>
      <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
        <Ionicons name="checkmark" size={48} color="#000" />
      </Animated.View>
      <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
        <Text style={styles.stepTitle}>준비 완료!</Text>
        <Text style={styles.stepDesc}>
          상품을 등록하면 목표가를 설정할 수 있어요{'\n'}
          가격이 목표가 이하로 떨어지면{'\n'}
          바로 알림을 보내드려요
        </Text>

        {/* 가상 알림 미리보기 */}
        <View style={styles.mockNotif}>
          <View style={styles.mockNotifIcon}>
            <Text style={{ fontSize: 16 }}>📉</Text>
          </View>
          <View style={styles.mockNotifContent}>
            <Text style={styles.mockNotifTitle}>기다렸다, 지금이야!</Text>
            <Text style={styles.mockNotifBody}>에어팟 프로 279,000원 — 목표가 도달!</Text>
          </View>
        </View>
      </Animated.View>

      <TouchableOpacity style={styles.primaryBtn} onPress={onComplete} activeOpacity={0.8}>
        <Text style={styles.primaryBtnText}>시작하기</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main ───
export default function OnboardingScreen({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const transitionAnim = useRef(new Animated.Value(1)).current;

  const goNext = () => {
    Animated.timing(transitionAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setStep((s) => s + 1);
      Animated.timing(transitionAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 진행 인디케이터 */}
      <View style={styles.progressBar}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              i === step && styles.progressDotActive,
              i < step && styles.progressDotDone,
            ]}
          />
        ))}
      </View>

      {step > 0 && step < 3 && (
        <TouchableOpacity style={styles.skipButton} onPress={onComplete}>
          <Text style={styles.skipText}>건너뛰기</Text>
        </TouchableOpacity>
      )}

      <Animated.View style={[styles.stepContainer, { opacity: transitionAnim }]}>
        {step === 0 && <Step1 onNext={goNext} />}
        {step === 1 && <Step2 onNext={goNext} />}
        {step === 2 && <Step3 onNext={goNext} />}
        {step === 3 && <Step4 onComplete={onComplete} />}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 16,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.border,
  },
  progressDotActive: {
    width: 24,
    backgroundColor: theme.primary,
  },
  progressDotDone: {
    backgroundColor: 'rgba(0, 229, 204, 0.4)',
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
  },
  skipText: {
    color: theme.subtext,
    fontSize: 15,
  },
  stepContainer: {
    flex: 1,
  },

  // ── 공통 ──
  step: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingBottom: 40,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 229, 204, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(0, 229, 204, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconEmoji: {
    fontSize: 44,
  },
  stepTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: theme.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  stepDesc: {
    fontSize: 15,
    color: theme.subtext,
    textAlign: 'center',
    lineHeight: 24,
  },
  primaryBtn: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 60,
    marginTop: 32,
    width: '100%',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '700',
  },

  // ── Step 1 ──
  featureList: {
    marginTop: 24,
    gap: 12,
    alignSelf: 'stretch',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
  },
  featureText: {
    color: theme.text,
    fontSize: 14,
  },

  // ── Step 2: Mock Phone ──
  mockPhone: {
    width: width * 0.75,
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'visible',
    marginBottom: 16,
  },
  mockHeader: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  mockHeaderBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444',
    alignSelf: 'center',
    marginBottom: 8,
  },
  mockHeaderText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  mockProduct: {
    padding: 16,
    alignItems: 'center',
  },
  mockImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#2a2a3e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  mockProductName: {
    color: '#eee',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  mockProductPrice: {
    color: theme.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  mockActionBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  mockActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a3e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mockShareBtn: {
    borderWidth: 2,
    borderColor: theme.primary,
    backgroundColor: 'rgba(0, 229, 204, 0.1)',
  },
  pointer: {
    position: 'absolute',
    bottom: -36,
    right: 24,
    alignItems: 'center',
  },
  pointerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: theme.primary,
  },
  pointerText: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },

  // ── Step 3: Share Sheet ──
  mockShareSheet: {
    width: width * 0.85,
    backgroundColor: '#1c1c1e',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  shareSheetHandle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#555',
    alignSelf: 'center',
    marginBottom: 16,
  },
  shareSheetTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  shareSheetGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  shareIconItem: {
    alignItems: 'center',
    width: 64,
  },
  shareIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  shareAppEmoji: {
    fontSize: 24,
  },
  shareIconLabel: {
    color: '#aaa',
    fontSize: 11,
  },
  tapPulse: {
    position: 'absolute',
    top: -4,
    left: 3,
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: theme.primary,
  },
  checkBadge: {
    position: 'absolute',
    top: -2,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  step3Hint: {
    color: theme.subtext,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
  },

  // ── Step 4 ──
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  mockNotif: {
    flexDirection: 'row',
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    padding: 14,
    marginTop: 24,
    gap: 12,
    alignItems: 'center',
    width: '100%',
  },
  mockNotifIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#2a2a3e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mockNotifContent: {
    flex: 1,
  },
  mockNotifTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  mockNotifBody: {
    color: '#aaa',
    fontSize: 12,
  },
});
