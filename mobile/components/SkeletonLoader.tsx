import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

export function ChatSkeleton() {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.7,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        })
      ])
    ).start();
  }, []);

  return (
    <View style={{ gap: 12, padding: 16 }}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          {/* Avatar Skeleton */}
          <Animated.View style={[styles.avatarSkeleton, { opacity: pulseAnim }]} />
          
          <View style={{ flex: 1, gap: 8 }}>
            {/* Title Skeleton */}
            <Animated.View style={[styles.titleSkeleton, { opacity: pulseAnim, width: `${50 + (i % 3) * 15}%` }]} />
            {/* Subtitle Skeleton */}
            <Animated.View style={[styles.subtitleSkeleton, { opacity: pulseAnim }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function PublicationSkeleton() {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.7,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        })
      ])
    ).start();
  }, []);

  return (
    <View style={{ gap: 20, padding: 16 }}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.pubSkeletonContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            {/* Author Avatar */}
            <Animated.View style={[styles.pubAvatar, { opacity: pulseAnim }]} />
            <View style={{ flex: 1, gap: 6 }}>
              {/* Author name */}
              <Animated.View style={[styles.pubAuthor, { opacity: pulseAnim }]} />
              {/* Subtext */}
              <Animated.View style={[styles.pubSub, { opacity: pulseAnim }]} />
            </View>
          </View>
          
          {/* Content lines */}
          <View style={{ gap: 6, marginBottom: 14 }}>
            <Animated.View style={[styles.pubLine, { opacity: pulseAnim, width: '100%' }]} />
            <Animated.View style={[styles.pubLine, { opacity: pulseAnim, width: '85%' }]} />
            <Animated.View style={[styles.pubLine, { opacity: pulseAnim, width: '60%' }]} />
          </View>

          {/* Action Row */}
          <View style={{ flexDirection: 'row', gap: 16, paddingTop: 12, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
            <Animated.View style={[styles.pubAction, { opacity: pulseAnim }]} />
            <Animated.View style={[styles.pubAction, { opacity: pulseAnim }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    gap: 12,
  },
  avatarSkeleton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  titleSkeleton: {
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  subtitleSkeleton: {
    height: 10,
    width: '40%',
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  pubSkeletonContainer: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  pubAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pubAuthor: {
    width: '35%',
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pubSub: {
    width: '50%',
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pubLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pubAction: {
    width: 48,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  }
});
