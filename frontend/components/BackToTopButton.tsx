import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Animated,
  FlatList,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../constants/colors";

export interface BackToTopHandle {
  handleScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

interface BackToTopButtonProps {
  scrollRef: React.RefObject<FlatList | ScrollView | null>;
  /** 出现/消失的滚动偏移阈值 */
  threshold?: number;
}

const BackToTopButton = forwardRef<BackToTopHandle, BackToTopButtonProps>(
  function BackToTopButton({ scrollRef, threshold = 400 }, ref) {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const [visible, setVisible] = useState(false);
    const opacity = useRef(new Animated.Value(0)).current;

    useImperativeHandle(
      ref,
      () => ({
        handleScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const y = e.nativeEvent.contentOffset.y;
          const show = y > threshold;
          setVisible((prev) => {
            if (show !== prev) return show;
            return prev;
          });
        },
      }),
      [threshold],
    );

    const scrollToTop = useCallback(() => {
      const node = scrollRef.current;
      if (!node) return;
      if (typeof (node as ScrollView).scrollTo === "function") {
        (node as ScrollView).scrollTo({ y: 0, animated: true });
      } else if (typeof (node as FlatList).scrollToOffset === "function") {
        (node as FlatList).scrollToOffset({ offset: 0, animated: true });
      }
    }, [scrollRef]);

    const anim = useRef<Animated.CompositeAnimation | null>(null);
    React.useEffect(() => {
      anim.current?.stop();
      anim.current = Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      });
      anim.current.start();
    }, [visible, opacity]);

    return (
      <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 72, right: 16 }]}>
        <Animated.View
          style={[styles.fade, { opacity }]}
          pointerEvents={visible ? "auto" : "none"}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回顶部"
            onPress={scrollToTop}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.primary, shadowColor: colors.primary },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
      </View>
    );
  },
);

export default BackToTopButton;

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    alignItems: "flex-end",
  },
  fade: {
    opacity: 0,
  },
  button: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  pressed: {
    opacity: 0.85,
  },
});
