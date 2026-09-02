"use client";

import { useAuth } from "@/components/AuthProvider";
import { FeedbackModal, type FeedbackMode } from "@/components/FeedbackModal";
import {
  isMonthlyFeedbackDue,
  markFeedbackSubmitted,
  snoozeFeedbackSchedule,
  touchFeedbackSchedule,
  type FeedbackSchedule,
} from "@/lib/feedback";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type FeedbackApi = {
  openManual: () => void;
  /** Opens the four-question monthly round, when the reader asks for it. */
  openMonthly: () => void;
  /** Puts the monthly round off for another month, without opening it. */
  snoozeMonthly: () => void;
  /** A month has passed and the round has not been answered or snoozed. */
  monthlyDue: boolean;
  close: () => void;
  mode: FeedbackMode | null;
};

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  return (
    useContext(FeedbackContext) ?? {
      openManual: () => undefined,
      openMonthly: () => undefined,
      snoozeMonthly: () => undefined,
      monthlyDue: false,
      close: () => undefined,
      mode: null,
    }
  );
}

export function FeedbackHost({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth();
  const [mode, setMode] = useState<FeedbackMode | null>(null);
  const [monthlyDue, setMonthlyDue] = useState(false);
  const scheduleRef = useRef<FeedbackSchedule | null>(null);

  const close = useCallback(() => {
    setMode((current) => {
      if (current === "monthly" && scheduleRef.current) {
        scheduleRef.current = snoozeFeedbackSchedule(scheduleRef.current);
        setMonthlyDue(false);
      }
      return null;
    });
  }, []);

  const openManual = useCallback(() => {
    setMode("manual");
  }, []);

  const openMonthly = useCallback(() => {
    setMode((current) => (current ? current : "monthly"));
  }, []);

  const snoozeMonthly = useCallback(() => {
    if (scheduleRef.current) {
      scheduleRef.current = snoozeFeedbackSchedule(scheduleRef.current);
    }
    setMonthlyDue(false);
  }, []);

  /*
    NOTHING OPENS OVER THE ROOM THE READER CAME FOR.

    This used to set a 1600ms timer on launch and put the four-question
    round on screen over whatever they had opened the app to look at, once
    a month, with "Not this month" as the only way out. An app whose
    walkthrough promises "no daily note, no alert, and no come back" cannot
    then interrupt somebody to ask how their month went, and a modal
    nobody asked for arriving a second and a half after launch is the
    oldest growth trick there is.

    The cadence and the snooze are unchanged. What changed is who starts
    it: the round is offered as a row in Account's feedback panel, where
    somebody is already looking at settings, and it waits there until they
    press it or put it off.
  */
  useEffect(() => {
    if (!ready || !user) return;
    const created =
      user.created_at && user.created_at.length > 0 ? user.created_at : null;
    const schedule = touchFeedbackSchedule(created);
    scheduleRef.current = schedule;
    setMonthlyDue(isMonthlyFeedbackDue(schedule));
  }, [ready, user]);

  const onSent = useCallback(() => {
    if (scheduleRef.current) {
      scheduleRef.current = markFeedbackSubmitted(scheduleRef.current);
    }
    setMonthlyDue(false);
  }, []);

  const api = useMemo(
    () => ({ openManual, openMonthly, snoozeMonthly, monthlyDue, close, mode }),
    [openManual, openMonthly, snoozeMonthly, monthlyDue, close, mode]
  );

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      {mode && (
        <FeedbackModal mode={mode} onClose={close} onSent={onSent} />
      )}
    </FeedbackContext.Provider>
  );
}
