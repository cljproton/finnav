import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Input from "@ant-design/react-native/es/input";
import { fetchCaptcha } from "../lib/captcha";
import { useThemeColors } from "../constants/colors";
import { useTranslation } from "react-i18next";

interface Props {
  colors: ReturnType<typeof useThemeColors>;
  value: string;
  onChangeText: (text: string) => void;
  onResolved: (token: string | null, answer: string) => void;
}

/**
 * 图形验证码：展示图片 + 输入框 + 刷新按钮。
 * 拿到 token 后通过 onResolved 交给父组件在提交时附带。
 */
export default function CaptchaInput({
  colors,
  value,
  onChangeText,
  onResolved,
}: Props) {
  const { t } = useTranslation();
  const [image, setImage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 父组件传入的回调每次渲染都会重新创建，用 ref 持有最新引用，
  // 避免因身份变化触发 load 的 useEffect 反复执行（导致验证码不断刷新）。
  const onChangeTextRef = useRef(onChangeText);
  const onResolvedRef = useRef(onResolved);
  onChangeTextRef.current = onChangeText;
  onResolvedRef.current = onResolved;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCaptcha();
      setImage(data.image);
      setToken(data.token);
      onChangeTextRef.current("");
      onResolvedRef.current(data.token, "");
    } catch (e: any) {
      setImage(null);
      setToken(null);
      onChangeTextRef.current("");
      onResolvedRef.current(null, "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleText = (text: string) => {
    onChangeTextRef.current(text);
    onResolvedRef.current(token, text);
  };

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: colors.chipBg,
            borderColor: colors.border,
          },
        ]}
      >
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.textTertiary} />
        <Input
          value={value}
          onChangeText={handleText}
          placeholder={t("图形验证码")}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={6}
          style={styles.inputContainer}
          inputStyle={[styles.inputText, { color: colors.text }]}
        />
      </View>
      <Pressable
        onPress={load}
        disabled={loading}
        style={[
          styles.imageWrap,
          { borderColor: colors.border, opacity: loading ? 0.6 : 1 },
        ]}
      >
        {image ? (
          <Image source={{ uri: image }} style={styles.image} resizeMode="contain" />
        ) : (
          <Text style={[styles.fallback, { color: colors.textTertiary }]}>
            {t("加载中…")}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  inputContainer: {
    flex: 1,
  },
  inputText: {
    fontSize: 15,
    borderWidth: 0,
  },
  imageWrap: {
    width: 96,
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    fontSize: 11,
  },
});