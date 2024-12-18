document.addEventListener('DOMContentLoaded', async () => {
    const birthdayInput = document.getElementById('birthday');
    birthdayInput.max = new Date().toISOString().split('T')[0];
});

// Progress bar functions
function updateProgress(progress, text) {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressContainer = document.getElementById('progressContainer');
    
    progressContainer.style.display = 'block';
    progressBar.style.width = `${progress}%`;
    progressText.textContent = text;
}

function hideProgress() {
    document.getElementById('progressContainer').style.display = 'none';
}

// Fetch songs from server
async function fetchSongs(month, year) {
    try {
        const response = await axios.post('/get-playlist', {
            month: month,
            year: year
        });
        return response.data;
    } catch (error) {
        console.error("Error fetching songs:", error);
        throw error;
    }
}

// Update the progress messages to be more whimsical
const progressMessages = [
    "✨ Crafting your musical time capsule...",
    "🎵 Weaving melodies through time...",
    "🌟 Sprinkling some musical magic...",
    "🎪 Creating something special for you...",
    "🎭 The magic is happening..."
];

// Handle form submission
document.getElementById('birthdayForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const playlistDiv = document.getElementById('playlist');
    const spotifyButton = document.getElementById('spotifyButton');
    playlistDiv.innerHTML = '';
    spotifyButton.style.display = 'none';
    
    try {
        const birthday = new Date(document.getElementById('birthday').value);
        const month = birthday.getMonth() + 1;
        const year = birthday.getFullYear();
        
        console.log(`Fetching songs for ${month}/${year}`);
        
        // Show initial progress
        updateProgress(10, 'Starting playlist generation...');

        // Simulate progress while waiting for response
        let progress = 10;
        let messageIndex = 0;
        const progressInterval = setInterval(() => {
            progress += 1;
            if (progress <= 90) {
                messageIndex = (messageIndex + 1) % progressMessages.length;
                document.getElementById('progressText').textContent = progressMessages[messageIndex];
            }
        }, 3000);

        const response = await axios.post('/get-playlist', {
            month: month,
            year: year
        });

        // Clear interval and show completion
        clearInterval(progressInterval);
        updateProgress(100, 'Playlist generated!');
        
        setTimeout(() => {
            hideProgress();
            displayPlaylist(response.data);
        }, 1000);
    } catch (error) {
        console.error('Error:', error);
        hideProgress();
        playlistDiv.innerHTML = '<div class="error">Error fetching songs. Please try again.</div>';
    }
});

// Add this function to handle the transition
function showPlaylist() {
    document.getElementById('initial-view').style.display = 'none';
    document.getElementById('playlist-view').style.display = 'block';
    
    // Get user's name
    const userName = document.getElementById('name').value;
    const playlistTitle = document.querySelector('#playlist-view h1');
    playlistTitle.textContent = `Time Travel Radio for ${userName}`;
}

// Add home button handler
document.getElementById('homeButton').addEventListener('click', () => {
    document.getElementById('playlist-view').style.display = 'none';
    document.getElementById('initial-view').style.display = 'block';
    document.getElementById('birthday').value = '';
    document.getElementById('name').value = '';
    document.getElementById('playlist').innerHTML = '';
    localStorage.removeItem('spotify_playlist_id');
});

// Update displayPlaylist function
function displayPlaylist(songs) {
    if (!songs || songs.length === 0) {
        alert('No songs found for the selected date.');
        return;
    }

    // Store songs data
    localStorage.setItem('full_playlist_data', JSON.stringify(songs));

    // Switch to playlist view
    showPlaylist();
    
    // Show Spotify button
    document.getElementById('spotifyButton').style.display = 'inline-flex';

    // Display songs
    const playlistDiv = document.getElementById('playlist');
    playlistDiv.innerHTML = '';

    const songsList = document.createElement('div');
    songsList.className = 'songs-list';

    songs.forEach((song, index) => {
        const songElement = document.createElement('div');
        songElement.className = 'song';
        songElement.innerHTML = `
            <span class="song-number">${index + 1}</span>
            <div class="song-info">
                <div class="song-title">${song.title}</div>
                <div class="song-artist">by ${song.artist}</div>
            </div>
            <span class="song-year">${song.year}</span>
            ${song.spotifyUri ? '<span class="spotify-check">✓</span>' : ''}
        `;
        songsList.appendChild(songElement);
    });

    playlistDiv.appendChild(songsList);
}

// Spotify integration
function createSpotifyPlaylist(songs) {
    console.log('Creating playlist with songs:', songs);
    console.log('Sample song URIs:', songs.slice(0, 3).map(s => s.spotifyUri));
    
    const spotifyButton = document.getElementById('spotifyButton');
    const originalButtonContent = spotifyButton.innerHTML;
    spotifyButton.innerHTML = `
        <div class="loading-spinner"></div>
        Connecting...
    `;
    spotifyButton.disabled = true;

    const clientId = '12fa30d589f34c008f68fe8857273e85';
    const redirectUri = `${window.location.origin}/callback`;
    const scope = 'playlist-modify-public playlist-modify-private user-read-private';
    const state = Math.random().toString(36).substring(7);

    localStorage.setItem('spotify_auth_state', state);
    localStorage.setItem('playlist_songs', JSON.stringify(songs));
    
    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('response_type', 'token');
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('scope', scope);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('show_dialog', 'true');

    console.log('Authorization URL:', authUrl.toString()); // Debug log

    const width = 450;
    const height = 730;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);

    const popup = window.open(
        authUrl.toString(),
        'Spotify Login',
        `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
        alert('Please allow popups for this website');
        spotifyButton.innerHTML = originalButtonContent;
        spotifyButton.disabled = false;
        return;
    }

    // Add popup check
    const popupTick = setInterval(() => {
        if (popup.closed) {
            clearInterval(popupTick);
            spotifyButton.innerHTML = originalButtonContent;
            spotifyButton.disabled = false;
        }
    }, 1000);

    const messageHandler = (event) => {
        clearInterval(popupTick);
        if (event.data.type === 'SPOTIFY_SUCCESS') {
            popup.close();
            spotifyButton.innerHTML = `
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Spotify_logo_without_text.svg/168px-Spotify_logo_without_text.svg.png" alt="Spotify">
                Playlist Created!
            `;
            
            // Store the playlist ID for sharing
            localStorage.setItem('spotify_playlist_id', event.data.playlistId);
            
            setTimeout(() => {
                spotifyButton.innerHTML = originalButtonContent;
                spotifyButton.disabled = false;
            }, 3000);
            alert(`Successfully created playlist with ${event.data.trackCount} tracks!`);
        } else if (event.data.type === 'SPOTIFY_ERROR') {
            popup.close();
            spotifyButton.innerHTML = originalButtonContent;
            spotifyButton.disabled = false;
            alert(`Error creating playlist: ${event.data.error}`);
        }
        window.removeEventListener('message', messageHandler);
    };

    window.addEventListener('message', messageHandler);

    // Get user's name
    const userName = document.getElementById('name').value;
    localStorage.setItem('playlist_name', `Time Travel Radio for ${userName}`);
}

// Add click handler to Spotify button
document.getElementById('spotifyButton').onclick = function() {
    const songs = JSON.parse(localStorage.getItem('full_playlist_data'));
    console.log('Retrieved songs for Spotify:', songs);
    if (songs && songs.length > 0) {
        createSpotifyPlaylist(songs);
    } else {
        alert('Please generate a playlist first');
    }
};

// Update share functionality
document.getElementById('shareButton').addEventListener('click', async () => {
    const spotifyPlaylistId = localStorage.getItem('spotify_playlist_id');
    
    if (!spotifyPlaylistId) {
        alert('Please save the playlist to Spotify first to share it!');
        return;
    }

    const shareUrl = `https://open.spotify.com/playlist/${spotifyPlaylistId}`;
    const shareData = {
        title: 'Time Travel Radio Playlist',
        text: 'Check out my Time Travel Radio playlist!',
        url: shareUrl
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            // Fallback: Copy to clipboard
            await navigator.clipboard.writeText(shareUrl);
            alert('Playlist link copied to clipboard!');
        }
    } catch (err) {
        console.error('Error sharing:', err);
        alert('Could not share the playlist. Try copying the link instead.');
    }
});

// Add at the end of the file
function showCookieConsent() {
    const cookieConsent = document.getElementById('cookie-consent');
    if (!localStorage.getItem('cookieConsent')) {
        setTimeout(() => {
            cookieConsent.classList.add('show');
        }, 1000);
    }
}

document.getElementById('accept-cookies')?.addEventListener('click', () => {
    localStorage.setItem('cookieConsent', 'true');
    document.getElementById('cookie-consent').classList.remove('show');
});

// Call on page load
showCookieConsent();