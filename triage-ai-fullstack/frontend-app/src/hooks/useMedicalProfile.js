import { useState, useEffect, useCallback } from "react";

const KEY = "triage-medical-profile";

export const defaultProfile = {
  bloodType: "",
  conditions: [], // ["Huyết áp", "Tim mạch", ...]
  allergies: [], // dị ứng thuốc/thực phẩm
  vaccines: [], // [{name, date}]
  bhyt: "", // mã BHYT
  contactName: "",
  contactPhone: "",
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile;
    return { ...defaultProfile, ...JSON.parse(raw) };
  } catch {
    return defaultProfile;
  }
}

/** Hồ sơ bệnh nền persisted vào LocalStorage. */
export function useMedicalProfile() {
  const [profile, setProfile] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(profile));
    } catch {}
  }, [profile]);

  const update = useCallback(
    (patch) => setProfile((p) => ({ ...p, ...patch })),
    []
  );

  const toggleCondition = useCallback((c) => {
    setProfile((p) => ({
      ...p,
      conditions: p.conditions.includes(c)
        ? p.conditions.filter((x) => x !== c)
        : [...p.conditions, c],
    }));
  }, []);

  const toggleAllergy = useCallback((a) => {
    setProfile((p) => ({
      ...p,
      allergies: (p.allergies || []).includes(a)
        ? p.allergies.filter((x) => x !== a)
        : [...(p.allergies || []), a],
    }));
  }, []);

  const addVaccine = useCallback((name, date) => {
    if (!name?.trim()) return;
    setProfile((p) => ({ ...p, vaccines: [...(p.vaccines || []), { name: name.trim(), date: date || "" }] }));
  }, []);

  const removeVaccine = useCallback((idx) => {
    setProfile((p) => ({ ...p, vaccines: (p.vaccines || []).filter((_, i) => i !== idx) }));
  }, []);

  return { profile, update, toggleCondition, toggleAllergy, addVaccine, removeVaccine };
}

/** Đọc nhanh (không hook) để đính kèm khi bấm SOS. */
export function readProfile() {
  return load();
}
