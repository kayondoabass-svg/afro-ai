import { bridge, isPreview } from "./bridge.mjs";

export async function initializeLibrary({ t = key => key } = {}) {
  const get = id => document.getElementById(id);
  const select = get("library-model"), status = get("library-status");
  const download = get("download-model"), load = get("load-downloaded"), remove = get("remove-model");
  const cancel = get("cancel-download"), progress = get("download-progress"), description = get("library-description");
  let models = [], busy = false, statusKey = "", statusValues = {}, rawStatus = "", selectedId = "";
  const translatedStatus = (key, values) => {
    const data = { ...values };
    if (key === "library.status") {
      const phaseKey = `library.phase.${values.phase}`;
      data.phase = t(phaseKey) === phaseKey ? values.phase : t(phaseKey);
    }
    return t(key, data);
  };
  const setStatus = (key, values = {}) => { statusKey = key; statusValues = values; rawStatus = ""; status.textContent = translatedStatus(key, values); };
  const setRawStatus = value => { statusKey = ""; rawStatus = String(value || ""); status.textContent = rawStatus; };
  function renderOptions() {
    selectedId = select.value || selectedId;
    select.replaceChildren();
    for (const model of models) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.name + (model.installed ? t("model.downloaded") : "");
      select.append(option);
    }
    if (models.some(model => model.id === selectedId)) select.value = selectedId;
  }
  function controls() {
    const model = models.find(item => item.id === select.value);
    select.disabled = busy || !models.length;
    download.disabled = busy || !model || model.installed;
    load.disabled = busy || !model?.installed;
    remove.disabled = busy || !model || (!model.installed && !model.resumable);
    download.textContent = model?.resumable ? t("model.resume") : t("model.download");
    const knownCatalog = model?.id === "qwen25-05b-instruct" || model?.id === "qwen25-7b-instruct";
    const suffix = model?.id === "qwen25-05b-instruct" ? "small" : "large";
    const modelDescription = knownCatalog ? t(`library.catalogDescription.${suffix}`) : model?.description;
    const modelStatus = knownCatalog ? t(`library.catalogStatus.${suffix}`) : model?.status;
    description.textContent = model ? `${modelDescription} ${(model.bytes / 1024 ** 3).toFixed(2)} GiB · ${model.license} · ${modelStatus}` : "";
    if (statusKey) status.textContent = translatedStatus(statusKey, statusValues);
    else if (rawStatus) status.textContent = rawStatus;
  }
  async function refresh() {
    const selected = select.value;
    models = await bridge.listModels();
    selectedId = selected;
    renderOptions();
    controls();
  }
  async function action(fn) {
    busy = true; controls();
    try { await fn(); await refresh(); }
    catch (error) { setRawStatus(error.message); }
    finally { busy = false; cancel.hidden = true; progress.hidden = true; controls(); }
  }
  select.addEventListener("change", controls);
  download.addEventListener("click", () => action(async () => {
    setStatus("library.downloadAwait"); cancel.hidden = false;
    const result = await bridge.downloadModel(select.value);
    if (!result) setStatus("library.downloadNotStarted");
  }));
  load.addEventListener("click", () => action(async () => {
    setStatus("library.checking");
    const state = await bridge.loadDownloaded(select.value);
    const mode = get("mode-select"); mode.value = state.model.chatTemplate ? "chat" : "completion"; mode.dispatchEvent(new Event("change"));
    const tokens = get("max-tokens"); tokens.value = state.model.parameters > 1e9 ? "4" : "32"; tokens.dispatchEvent(new Event("input"));
    setStatus("library.loaded");
  }));
  remove.addEventListener("click", () => action(async () => { await bridge.removeModel(select.value); setStatus("library.refreshed"); }));
  cancel.addEventListener("click", async () => { try { await bridge.cancelDownload(); } catch (error) { setRawStatus(error.message); } });
  bridge.onEvent(event => {
    if (event.type !== "download") return;
    progress.hidden = false; progress.max = event.total; progress.value = event.received ?? 0;
    if (event.error) {
      if (event.error === "Download cancelled; partial files kept for resume.") setStatus("library.downloadCancelled");
      else setRawStatus(event.error);
    } else {
      setStatus("library.status", { phase: event.phase, percent: Math.round(100 * (event.received ?? 0) / event.total), file: event.file || "" });
    }
  });
  window.addEventListener("keyo:localechange", () => { renderOptions(); controls(); });
  try { await refresh(); if (isPreview) setStatus("library.preview"); }
  catch (error) { setRawStatus(error.message); }
}
