// Extraído de public/user/home.html (bloco inline #1) para permitir CSP sem unsafe-inline.
// Global error handling
    window.addEventListener('error', function(event) {
      console.error('Unhandled error:', event.error);
    });

    // Prevent search bar movement on mobile only
    window.addEventListener('DOMContentLoaded', function() {
      const searchContainer = document.querySelector('.search-container');
      const searchInput = document.querySelector('.search-txt');
      const isMobile = window.matchMedia('(max-width: 768px)').matches;

      if (searchInput && searchContainer) {
        // Prevent any movement on focus/click - only on mobile devices
        searchInput.addEventListener('focus', function(e) {
          // Apenas aplicar em dispositivos móveis
          if (isMobile) {
            // Ensure the container stays fixed
            searchContainer.style.position = 'fixed';
            searchContainer.style.left = '50%';
            searchContainer.style.transform = 'translateX(-50%)';
            // Prevent scrolling or viewport adjustment
            setTimeout(function() {
              window.scrollTo(0, 0);
            }, 10);
          }
        });

        // Prevent touch events from causing movement
        searchContainer.addEventListener('touchstart', function(e) {
          e.stopPropagation();
        }, {passive: true});

        searchContainer.addEventListener('touchmove', function(e) {
          e.stopPropagation();
        }, {passive: true});
      }
    });
