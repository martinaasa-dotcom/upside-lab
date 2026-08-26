"use client";

import { useToast } from "@/components/ui/Toast";
import {
  IMAGE_FILE_ACCEPT,
  imageFilesFromList,
} from "@/lib/chat-images";
import {
  useCallback,
  useRef,
  type ChangeEvent,
  type RefObject,
} from "react";

export type ScreenshotPicker = {
  open: () => void;
  ref: RefObject<HTMLInputElement | null>;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  multiple: boolean;
  disabled: boolean;
};

/**
 * File picker that only opens from a real tap. The input stays inert
 * (`hidden` + `tabIndex={-1}`) until `open()` runs in that click handler.
 * Do not call `open` from a layout or effect hook: Mobile Safari treats
 * that as a camera prompt.
 */
export function useScreenshotPicker({
  onPick,
  multiple = false,
  disabled = false,
}: {
  onPick: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
}): ScreenshotPicker {
  const ref = useRef<HTMLInputElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const { push: toast } = useToast();

  const open = useCallback(() => {
    if (!disabled) ref.current?.click();
  }, [disabled]);

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files;
      e.target.value = "";
      if (!picked?.length) return;
      const files = imageFilesFromList(picked);
      if (!files.length) {
        toast("That wasn't a picture. Try a screenshot.", "error");
        return;
      }
      onPickRef.current(files);
    },
    [toast]
  );

  return { open, ref, onChange, multiple, disabled };
}

export function screenshotPickerInputProps(picker: ScreenshotPicker) {
  return {
    ref: picker.ref,
    type: "file" as const,
    accept: IMAGE_FILE_ACCEPT,
    multiple: picker.multiple,
    tabIndex: -1 as const,
    "aria-hidden": true as const,
    disabled: picker.disabled,
    className: "hidden",
    onChange: picker.onChange,
  };
}
