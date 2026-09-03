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

  formatRawKHR: function(amount) {
    const riel = Math.round(amount);
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

  // Renders KHQR ABA simulated QR (Disabled per user request)
  drawKHQR: function(canvasId, amount) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    canvas.style.display = 'none';
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
};
