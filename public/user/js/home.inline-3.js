// Extraído de public/user/home.html (bloco inline #3) para permitir CSP sem unsafe-inline.
// Section management functions
    function initSectionManagement() {
      // Show map section
      window.showMapaSection = function() {
        document.getElementById('mapaContent').style.display = 'block';
        document.getElementById('favoritosSection').style.display = 'none';
        document.getElementById('reservasSection').style.display = 'none';

        // Update active states
        document.querySelectorAll('.sidebar nav li').forEach(li => li.classList.remove('active'));
        document.getElementById('nav-mapa').classList.add('active');

        // Refresh map if needed
        if (window.map) {
          setTimeout(() => window.map.invalidateSize(), 100);
        }
      };

      // Show favorites section
      window.showFavoritosSection = function() {
        document.getElementById('mapaContent').style.display = 'none';
        document.getElementById('favoritosSection').style.display = 'block';
        document.getElementById('reservasSection').style.display = 'none';

        // Update active states
        document.querySelectorAll('.sidebar nav li').forEach(li => li.classList.remove('active'));
        document.getElementById('nav-favoritos').classList.add('active');

        // Load favorites
        if (typeof loadFavoritos === 'function') {
          loadFavoritos();
        }
      };

      // Show reservations section
      window.showReservasSection = function() {
        document.getElementById('mapaContent').style.display = 'none';
        document.getElementById('favoritosSection').style.display = 'none';
        document.getElementById('reservasSection').style.display = 'block';

        // Update active states
        document.querySelectorAll('.sidebar nav li').forEach(li => li.classList.remove('active'));
        document.getElementById('nav-reservas').classList.add('active');

        // Load reservations using the correct function
        if (typeof loadMinhasReservas === 'function') {
          loadMinhasReservas();
        }
      };
    }
