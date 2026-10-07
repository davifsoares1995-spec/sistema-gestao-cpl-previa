(() => {
  const target = new URL('motorista.html', window.location.href).href.split('?')[0];
  const canvas = document.getElementById('driverQr');
  const status = document.getElementById('qrStatus');
  const openLink = document.getElementById('openDriverPage');
  const downloadButton = document.getElementById('downloadQr');

  openLink.href = target;
  document.getElementById('targetUrl').textContent = target;
  document.getElementById('printQr').addEventListener('click', () => window.print());

  async function renderQr() {
    try {
      if (!window.QRCodeLib) throw new Error('Biblioteca de QR Code indisponível.');

      await window.QRCodeLib.toCanvas(canvas, target, {
        errorCorrectionLevel: 'H',
        margin: 3,
        width: 340,
        color: { dark: '#102b41', light: '#ffffff' },
      });

      status.textContent = 'QR Code pronto para uso.';
      downloadButton.disabled = false;
    } catch (error) {
      console.error(error);
      status.textContent = 'Não foi possível gerar o QR Code. Use o botão para abrir a página.';
      downloadButton.disabled = true;
    }
  }

  downloadButton.disabled = true;
  downloadButton.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'qr-leitura-motorista-cpl.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  renderQr();
})();
