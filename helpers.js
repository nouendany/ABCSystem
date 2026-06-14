// Helper utility functions for POS calculations and visuals
window.POS_HELPERS = {
  EXCHANGE_RATE: 4100, // 1 USD = 4100 KHR

  // Formats currency nicely. Standard stores in Cambodia use USD and KHR interchangeably.
  formatUSD: function(amount) {
    return '$' + parseFloat(amount).toFixed(2);
  },

  formatKHR: function(amount) {
    const riel = Math.round(amount * this.EXCHANGE_RATE);
    return riel.toLocaleString('en-US') + ' ៛';
  },

  formatDualCurrency: function(amount, currentLang) {
    const usdStr = this.formatUSD(amount);
    const khrStr = this.formatKHR(amount);
    if (currentLang === 'km') {
      return `${usdStr} (${khrStr})`;
    }
    return `${usdStr} (${khrStr})`;
  },

  // Pretty dates
  formatDate: function(dateStr, lang) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    const khmerMonths = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
    const khmerNumbers = ["០", "១", "២", "៣", "៤", "៥", "៦", "៧", "៨", "៩"];
    
    const day = date.getDate();
    const month = date.getMonth();
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    if (lang === 'km') {
      // Map to Khmer numbers for fully native look
      const toKhmerNum = (num) => String(num).split('').map(char => khmerNumbers[parseInt(char)] || char).join('');
      return `${toKhmerNum(day)}-${khmerMonths[month]}-${toKhmerNum(year)} ${toKhmerNum(hours)}:${toKhmerNum(minutes)}`;
    } else {
      const enMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${day}-${enMonths[month]}-${year} ${hours}:${minutes}`;
    }
  },

  // Generates a mock SKU barcode layout or visual ID
  generateBarcode: function(sku) {
    // Generate a visual barcode with stripes
    let hash = 0;
    for (let i = 0; i < sku.length; i++) {
      hash = sku.charCodeAt(i) + ((hash << 5) - hash);
    }
    let html = '<div class="barcode-stripes">';
    for (let i = 0; i < 24; i++) {
      const width = ((hash >> i) & 1) ? '3px' : '1px';
      const margin = ((hash >> (i + 1)) & 1) ? '2px' : '1px';
      html += `<span style="display:inline-block; height:32px; background:var(--text-color); width:${width}; margin-right:${margin}; opacity:0.85;"></span>`;
    }
    html += '</div>';
    return html;
  },

  // Renders a beautiful high-fidelity KHQR ABA simulated QR onto a Canvas element
  drawKHQR: function(canvasId, amount) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    // 1. Draw KHQR / ABA Outer Frame Style (Cambodia Red/Crimson gradient boundary, rounded edges)
    ctx.fillStyle = '#0e1d35'; // Deep blue background
    ctx.fillRect(0, 0, w, h);

    // Inner white card for the QR code
    const cardMargin = 12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(cardMargin, cardMargin, w - cardMargin*2, h - cardMargin*2, 12);
    ctx.fill();

    // 2. Draw ABA style header text inside card
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#d22730'; // Red accent
    ctx.textAlign = 'center';
    ctx.fillText('ABA PAY', w/2, cardMargin + 20);

    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText('ANTIGRAVITY POS', w/2, cardMargin + 32);

    // 3. Draw a stylized simulated QR pattern (blocks of pixels, with standard corner squares)
    const qrX = cardMargin + 25;
    const qrY = cardMargin + 48;
    const qrW = w - (cardMargin + 25)*2;
    const qrH = qrW;

    ctx.fillStyle = '#09152b'; // Dark color for QR
    
    // Draw 3 Position Detection Squares (Top-Left, Top-Right, Bottom-Left)
    const drawAnchor = (x, y, size) => {
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
      ctx.fillStyle = '#09152b';
      ctx.fillRect(x + 4, y + 4, size - 8, size - 8);
    };

    const anchorSize = 18;
    // Top Left
    drawAnchor(qrX, qrY, anchorSize);
    // Top Right
    drawAnchor(qrX + qrW - anchorSize, qrY, anchorSize);
    // Bottom Left
    drawAnchor(qrX, qrY + qrH - anchorSize, anchorSize);

    // Small alignment pattern bottom right
    ctx.fillRect(qrX + qrW - 10, qrY + qrH - 10, 4, 4);

    // Simulated QR dots (highly organic look, random fill but reproducible)
    let seed = Math.round(amount * 100);
    const random = () => {
      let x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    const dotSize = 2.5;
    for (let x = qrX + 2; x < qrX + qrW - 2; x += dotSize) {
      for (let y = qrY + 2; y < qrY + qrH - 2; y += dotSize) {
        // Skip anchors
        const inTopLeft = (x < qrX + anchorSize + 2 && y < qrY + anchorSize + 2);
        const inTopRight = (x > qrX + qrW - anchorSize - 2 && y < qrY + anchorSize + 2);
        const inBottomLeft = (x < qrX + anchorSize + 2 && y > qrY + qrH - anchorSize - 2);
        
        if (!inTopLeft && !inTopRight && !inBottomLeft) {
          if (random() > 0.45) {
            ctx.fillStyle = '#09152b';
            ctx.fillRect(x, y, dotSize, dotSize);
          }
        }
      }
    }

    // 4. Center Logo badge (Simulated KHQR logo - stylized Cambodian emblem in red and blue)
    const logoSize = 16;
    const logoX = qrX + qrW/2 - logoSize/2;
    const logoY = qrY + qrH/2 - logoSize/2;
    
    // Logo background circle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(qrX + qrW/2, qrY + qrH/2, logoSize/2 + 2, 0, Math.PI * 2);
    ctx.fill();

    // Emblem drawing (Red and Blue halves)
    ctx.fillStyle = '#d22730';
    ctx.beginPath();
    ctx.arc(qrX + qrW/2, qrY + qrH/2, logoSize/2, Math.PI * 1.5, Math.PI * 0.5);
    ctx.fill();

    ctx.fillStyle = '#005a9c';
    ctx.beginPath();
    ctx.arc(qrX + qrW/2, qrY + qrH/2, logoSize/2, Math.PI * 0.5, Math.PI * 1.5);
    ctx.fill();

    // Center star/symbol in white
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText('QR', qrX + qrW/2, qrY + qrH/2 + 3);

    // 5. Draw Amount footer inside card
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#09152b';
    ctx.fillText(this.formatUSD(amount), w/2, qrY + qrH + 20);

    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#059669'; // Emerald Green
    ctx.fillText(this.formatKHR(amount), w/2, qrY + qrH + 32);
  }
};
