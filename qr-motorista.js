(() => {
  const DRIVER_BASE = 'https://davifsoares1995-spec.github.io/sistema-gestao-cpl-motorista/';
  const STORAGE_KEY = 'cpl-fleet-preview-functional-v5';
  const machineKinds = new Set(['Retroescavadeira', 'Escavadeira']);
  const canvas = document.getElementById('driverQr');
  const status = document.getElementById('qrStatus');
  const openLink = document.getElementById('openDriverPage');
  const downloadButton = document.getElementById('downloadQr');
  const select = document.getElementById('equipmentSelect');
  let target = DRIVER_BASE;
  let selected = null;

  function equipmentList() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved?.equipment?.length) return saved.equipment;
    } catch (_) {}
    return (window.FLEET_PREVIEW_DATA?.equipment || []).map(item => ({...item, unit: machineKinds.has(item.kind) ? 'h' : 'km'}));
  }

  const equipment = equipmentList().sort((a, b) => a.identifier.localeCompare(b.identifier, 'pt-BR', {numeric: true}));
  select.innerHTML = equipment.map(item => {
    const id = String(item.id).replace(/"/g, '&quot;');
    return `<option value="${id}">${item.identifier} · ${item.unit === 'h' ? 'HORAS' : 'KM'}</option>`;
  }).join('');

  const requested = new URLSearchParams(location.search).get('equipamento');
  const requestedItem = equipment.find(item => item.identifier.toLocaleUpperCase('pt-BR') === String(requested || '').toLocaleUpperCase('pt-BR'));
  if (requestedItem) {
    select.value = requestedItem.id;
    select.disabled = true;
    document.getElementById('equipmentPicker').hidden = true;
  }
  document.getElementById('printQr').addEventListener('click', () => window.print());

  async function renderQr() {
    try {
      if (!window.QRCodeLib) throw new Error('Biblioteca de QR Code indisponível.');
      selected = equipment.find(item => item.id === select.value) || equipment[0];
      if (!selected) throw new Error('Nenhum equipamento disponível.');
      target = `${DRIVER_BASE}?equipamento=${encodeURIComponent(selected.identifier)}`;
      openLink.href = target;
      document.getElementById('targetUrl').textContent = target;
      document.getElementById('equipmentIdentifier').textContent = selected.identifier;
      document.getElementById('equipmentType').textContent = requestedItem ? (selected.unit === 'h' ? '🔒 MÁQUINA FIXADA NO QR' : '🔒 VEÍCULO FIXADO NO QR') : (selected.unit === 'h' ? 'MÁQUINA / EQUIPAMENTO' : 'VEÍCULO');
      document.getElementById('equipmentReadingType').textContent = selected.unit === 'h' ? 'Controle por horímetro' : 'Controle por quilometragem';
      await window.QRCodeLib.toCanvas(canvas, target, {errorCorrectionLevel: 'H', margin: 3, width: 340, color: {dark: '#102b41', light: '#ffffff'}});
      status.textContent = 'QR Code pronto para imprimir e fixar no equipamento.';
      downloadButton.disabled = false;
    } catch (error) {
      console.error(error);
      status.textContent = 'Não foi possível gerar o QR Code. Use o botão para abrir a página.';
      downloadButton.disabled = true;
    }
  }

  downloadButton.disabled = true;
  select.addEventListener('change', () => {
    const item = equipment.find(candidate => candidate.id === select.value);
    const url = new URL(location.href);
    if (item) url.searchParams.set('equipamento', item.identifier);
    history.replaceState(null, '', url);
    renderQr();
  });
  downloadButton.addEventListener('click', () => {
    const link = document.createElement('a');
    const safeIdentifier = String(selected?.identifier || 'equipamento').replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '');
    link.download = `qr-${safeIdentifier}-cpl.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
  renderQr();
})();
