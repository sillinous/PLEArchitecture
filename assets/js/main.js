/**
 * CEAS - Community Enterprise Architecture System
 * Main JavaScript
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  document.addEventListener('DOMContentLoaded', function() {
    initLucideIcons();
    initMermaid();
    initSmoothScroll();
    initProgressIndicators();
    initSearch();
    initThemeToggle();
    initDataVisualization();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LUCIDE ICONS
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initLucideIcons() {
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MERMAID DIAGRAMS
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initMermaid() {
    if (typeof mermaid !== 'undefined') {
      mermaid.initialize({
        startOnLoad: true,
        theme: 'dark',
        themeVariables: {
          primaryColor: '#3b82f6',
          primaryTextColor: '#f8fafc',
          primaryBorderColor: '#64748b',
          lineColor: '#64748b',
          secondaryColor: '#1e293b',
          tertiaryColor: '#0f172a',
          background: '#0f172a',
          mainBkg: '#1e293b',
          nodeBorder: '#64748b',
          clusterBkg: '#1e293b',
          clusterBorder: '#334155',
          titleColor: '#f8fafc',
          edgeLabelBackground: '#1e293b'
        },
        flowchart: {
          curve: 'basis',
          padding: 20
        },
        sequence: {
          actorMargin: 50,
          messageMargin: 40
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SMOOTH SCROLL
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href === '#') return;
        
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          const headerOffset = 100;
          const elementPosition = target.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
          
          // Update URL without scrolling
          history.pushState(null, null, href);
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROGRESS INDICATORS
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initProgressIndicators() {
    // Animate progress bars when they come into view
    const progressBars = document.querySelectorAll('.progress-bar');
    
    if (progressBars.length === 0) return;
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const bar = entry.target;
          const value = bar.dataset.value || 0;
          bar.style.setProperty('--progress', value + '%');
          bar.classList.add('animated');
        }
      });
    }, { threshold: 0.5 });
    
    progressBars.forEach(bar => observer.observe(bar));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH FUNCTIONALITY
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initSearch() {
    const searchInput = document.getElementById('site-search');
    const searchResults = document.getElementById('search-results');
    
    if (!searchInput || !searchResults) return;
    
    let searchIndex = null;
    
    // Load search index on first focus
    searchInput.addEventListener('focus', async function() {
      if (!searchIndex) {
        try {
          const response = await fetch('/search-index.json');
          searchIndex = await response.json();
        } catch (error) {
          console.error('Failed to load search index:', error);
        }
      }
    });
    
    // Search on input
    searchInput.addEventListener('input', debounce(function() {
      const query = this.value.toLowerCase().trim();
      
      if (query.length < 2) {
        searchResults.innerHTML = '';
        searchResults.classList.remove('active');
        return;
      }
      
      if (!searchIndex) return;
      
      const results = searchIndex.filter(item => {
        return item.title.toLowerCase().includes(query) ||
               item.content.toLowerCase().includes(query) ||
               (item.tags && item.tags.some(tag => tag.toLowerCase().includes(query)));
      }).slice(0, 10);
      
      renderSearchResults(results, searchResults, query);
    }, 300));
    
    // Close on click outside
    document.addEventListener('click', function(e) {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.remove('active');
      }
    });
  }
  
  function renderSearchResults(results, container, query) {
    if (results.length === 0) {
      container.innerHTML = '<div class="search-no-results">No results found</div>';
      container.classList.add('active');
      return;
    }
    
    const html = results.map(item => {
      const excerpt = getSearchExcerpt(item.content, query);
      return `
        <a href="${item.url}" class="search-result-item">
          <span class="search-result-type">${item.type || 'Page'}</span>
          <h4>${highlightMatch(item.title, query)}</h4>
          <p>${highlightMatch(excerpt, query)}</p>
        </a>
      `;
    }).join('');
    
    container.innerHTML = html;
    container.classList.add('active');
  }
  
  function getSearchExcerpt(content, query) {
    const index = content.toLowerCase().indexOf(query);
    if (index === -1) return content.substring(0, 150) + '...';
    
    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + query.length + 100);
    
    let excerpt = content.substring(start, end);
    if (start > 0) excerpt = '...' + excerpt;
    if (end < content.length) excerpt = excerpt + '...';
    
    return excerpt;
  }
  
  function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THEME TOGGLE
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initThemeToggle() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    
    // Check for saved preference or system preference
    const savedTheme = localStorage.getItem('ceas-theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const currentTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeToggleIcon(toggle, currentTheme);
    
    toggle.addEventListener('click', function() {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ceas-theme', next);
      updateThemeToggleIcon(toggle, next);
    });
  }
  
  function updateThemeToggleIcon(toggle, theme) {
    const icon = toggle.querySelector('i');
    if (icon) {
      icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
      lucide.createIcons();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA VISUALIZATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initDataVisualization() {
    // Initialize any charts or data visualizations
    initMetricCards();
    initCapabilityHeatmap();
  }
  
  function initMetricCards() {
    const metricCards = document.querySelectorAll('.metric-card[data-animate]');
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateMetricValue(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    
    metricCards.forEach(card => observer.observe(card));
  }
  
  function animateMetricValue(card) {
    const valueEl = card.querySelector('.metric-value');
    if (!valueEl) return;
    
    const targetValue = parseFloat(valueEl.dataset.value);
    const duration = 1000;
    const startTime = performance.now();
    
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutQuart(progress);
      const currentValue = targetValue * eased;
      
      valueEl.textContent = formatMetricValue(currentValue, valueEl.dataset.format);
      
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }
    
    requestAnimationFrame(update);
  }
  
  function formatMetricValue(value, format) {
    switch (format) {
      case 'currency':
        return '$' + Math.round(value).toLocaleString();
      case 'percent':
        return Math.round(value) + '%';
      case 'decimal':
        return value.toFixed(1);
      default:
        return Math.round(value).toString();
    }
  }
  
  function initCapabilityHeatmap() {
    const heatmapCells = document.querySelectorAll('.capability-cell');
    
    heatmapCells.forEach(cell => {
      const level = parseInt(cell.dataset.level) || 0;
      const maxLevel = 5;
      const intensity = level / maxLevel;
      
      // Set color based on capability level
      const hue = 200 + (intensity * 60); // Blue to green
      const saturation = 50 + (intensity * 30);
      const lightness = 20 + (intensity * 20);
      
      cell.style.backgroundColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func.apply(this, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  function easeOutQuart(x) {
    return 1 - Math.pow(1 - x, 4);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT FOR GLOBAL ACCESS
  // ═══════════════════════════════════════════════════════════════════════════
  
  window.CEAS = {
    initLucideIcons,
    initMermaid,
    debounce
  };

})();
