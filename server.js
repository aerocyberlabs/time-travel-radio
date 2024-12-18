require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;
const SPOTIFY_REDIRECT_URI = 'https://oyster-app-k3xwg.ondigitalocean.app/callback';

const SPOTIFY_SCOPES = [
    'playlist-modify-public',
    'playlist-modify-private'
].join(' ');

// Update the Spotify authorization URL
const authUrl = `https://accounts.spotify.com/authorize?client_id=${process.env.SPOTIFY_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}&scope=${encodeURIComponent(SPOTIFY_SCOPES)}`;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to delay execution
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to get random years with backward search for recent dates
function getRandomYears(startYear, endYear, count) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    // If the date is recent (within last 2 years), include past years
    if (endYear >= currentYear - 2) {
        // Create array of years going back 5 years from the start year
        const backwardYears = Array.from(
            { length: 5 },
            (_, i) => startYear - (i + 1)
        );
        
        // Create array of available forward years
        const forwardYears = Array.from(
            { length: endYear - startYear + 1 },
            (_, i) => startYear + i
        );
        
        // Combine both arrays
        const availableYears = [...backwardYears, ...forwardYears];
        
        // Shuffle array using Fisher-Yates algorithm
        for (let i = availableYears.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableYears[i], availableYears[j]] = [availableYears[j], availableYears[i]];
        }
        
        return availableYears.slice(0, count);
    }
    
    // For older dates, keep the original logic
    const availableYears = Array.from(
        { length: endYear - startYear + 1 },
        (_, i) => startYear + i
    );

    // Shuffle array
    for (let i = availableYears.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableYears[i], availableYears[j]] = [availableYears[j], availableYears[i]];
    }

    return availableYears.slice(0, count);
}

// Helper function to retry failed requests
async function retryRequest(fn, retries = 3, delay = 2000) {
    try {
        return await fn();
    } catch (error) {
        if (retries === 0) throw error;
        
        // Check if we should retry based on the error
        const shouldRetry = error.code === 'ECONNRESET' || 
                          error.code === 'ETIMEDOUT' ||
                          (error.response && error.response.status >= 500) ||
                          !error.response;
        
        if (!shouldRetry) throw error;
        
        console.log(`Request failed (${error.message}), retrying in ${delay}ms... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return retryRequest(fn, retries - 1, delay * 1.5);
    }
}

// Route to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Callback route for Spotify
app.get('/callback', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'callback.html'));
});

// Endpoint to get the playlist
app.post('/get-playlist', async (req, res) => {
    const { month, year } = req.body;
    console.log(`Received request for ${month}/${year}`);
    
    try {
        const songs = await fetchSongs(month, year, (progress, message) => {
            console.log(`Progress: ${progress}% - ${message}`);
        });
        
        console.log(`Found ${songs.length} songs`);
        res.json(songs);
    } catch (error) {
        console.error("Error fetching songs", error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: "Error fetching songs", 
                message: "Please try again in a few minutes" 
            });
        }
    }
});

// Add this new function to verify songs with Spotify
async function getSpotifyAccessToken() {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    
    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', 
            'grant_type=client_credentials', {
            headers: {
                'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting Spotify access token:', error);
        throw error;
    }
}

// Modify the verifySpotifySongs function to be more lenient in search
async function verifySpotifySongs(tracks) {
    const accessToken = await getSpotifyAccessToken();
    const verifiedTracks = [];
    
    for (const track of tracks) {
        try {
            const cleanTitle = track.title.replace(/[^\w\s]/gi, '').trim();
            const cleanArtist = track.artist.replace(/[^\w\s]/gi, '').trim();
            
            if (!cleanTitle || !cleanArtist) {
                console.log(`Skipping track due to empty title/artist after cleaning: ${track.title} by ${track.artist}`);
                continue;
            }

            const searchResponse = await retryRequest(async () => {
                return axios.get('https://api.spotify.com/v1/search', {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    },
                    params: {
                        q: `track:"${cleanTitle}" artist:"${cleanArtist}"`,
                        type: 'track',
                        limit: 1
                    }
                });
            }, 3, 1000);

            if (searchResponse.data.tracks.items.length > 0) {
                const spotifyTrack = searchResponse.data.tracks.items[0];
                console.log(`✓ Found match: "${track.title}" by ${track.artist} (URI: ${spotifyTrack.uri})`);
                verifiedTracks.push({
                    ...track,
                    spotifyId: spotifyTrack.id,
                    spotifyUri: spotifyTrack.uri,
                    previewUrl: spotifyTrack.preview_url
                });
            } else {
                console.log(`✗ No match found: "${track.title}" by ${track.artist}`);
            }

            await delay(200);
        } catch (error) {
            if (error.response) {
                console.error(`Error verifying track "${track.title}": ${error.response.status} - ${error.response.statusText}`);
            } else {
                console.error(`Error verifying track "${track.title}":`, error.message);
            }
            await delay(500);
            continue;
        }
    }

    console.log(`Verified ${verifiedTracks.length} tracks out of ${tracks.length} total tracks`);
    return verifiedTracks;
}

// Add this new function to get tracks from an album
async function getTracksFromRelease(releaseId) {
    try {
        const response = await retryRequest(async () => {
            return axios.get(`https://musicbrainz.org/ws/2/recording`, {
                headers: {
                    'User-Agent': process.env.MUSICBRAINZ_USER_AGENT
                },
                params: {
                    release: releaseId,
                    fmt: 'json'
                }
            });
        });

        if (response.data && response.data.recordings) {
            return response.data.recordings.map(recording => ({
                title: recording.title,
                artist: recording['artist-credit']?.[0]?.name || '',
                duration: recording.length,
                releaseId: releaseId
            }));
        }
        return [];
    } catch (error) {
        console.error(`Error fetching tracks for release ${releaseId}:`, error.message);
        return [];
    }
}

// Update the fetchSongs function to directly get tracks
async function fetchSongs(month, year, progressCallback) {
    progressCallback(10, 'Fetching tracks from MusicBrainz...');
    
    let allTracks = [];
    const monthStr = month < 10 ? `0${month}` : month;
    const currentYear = new Date().getFullYear();
    
    const selectedYears = getRandomYears(year, currentYear, 15);
    console.log(`Selected years: ${selectedYears.join(', ')}`);

    // Directly fetch recordings (tracks)
    for (const y of selectedYears) {
        try {
            const response = await retryRequest(async () => {
                return axios.get(`https://musicbrainz.org/ws/2/recording`, {
                    headers: {
                        'User-Agent': process.env.MUSICBRAINZ_USER_AGENT
                    },
                    params: {
                        query: `date:${y}-${monthStr}`,
                        fmt: 'json',
                        limit: 100
                    }
                });
            });

            if (response.data && response.data.recordings) {
                const tracks = response.data.recordings
                    .filter(recording => recording['artist-credit'])
                    .map(recording => ({
                        title: recording.title,
                        artist: recording['artist-credit'][0].name,
                        year: y
                    }));
                allTracks = allTracks.concat(tracks);
            }

            await delay(1000); // Respect rate limiting
        } catch (error) {
            console.error(`Error fetching tracks for ${y}-${monthStr}:`, error.message);
            continue;
        }
    }

    progressCallback(50, 'Processing tracks...');
    allTracks = allTracks.sort(() => Math.random() - 0.5);
    
    const uniqueTracks = [...new Set(allTracks.map(track => JSON.stringify(track)))]
        .map(trackStr => JSON.parse(trackStr))
        .slice(0, 150);

    if (uniqueTracks.length === 0) {
        throw new Error('No tracks found for the specified criteria');
    }

    progressCallback(70, 'Verifying tracks with Spotify...');
    const verifiedTracks = await verifySpotifySongs(uniqueTracks);
    
    progressCallback(90, 'Finalizing playlist...');
    const finalTracks = verifiedTracks.slice(0, 50);
    
    progressCallback(100, 'Playlist ready!');
    return finalTracks;
}

// Modify the create-spotify-playlist endpoint to use the stored URIs
app.post('/create-spotify-playlist', async (req, res) => {
    const { accessToken, songs } = req.body;
    const playlistName = req.body.playlistName || 'Time Travel Radio Playlist';
    
    try {
        // Create playlist with custom name
        const playlistResponse = await axios.post(`https://api.spotify.com/v1/users/${userId}/playlists`, {
            name: playlistName,
            description: 'A musical journey through time, generated by Time Travel Radio'
        }, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const playlistId = playlistResponse.data.id;
        console.log('Created playlist:', playlistId);

        // Get track URIs and log them
        const trackUris = songs
            .filter(song => {
                if (!song.spotifyUri) {
                    console.log('Song missing URI:', song);
                    return false;
                }
                return true;
            })
            .map(song => song.spotifyUri);
        
        console.log(`Adding ${trackUris.length} tracks to playlist`);
        console.log('First few URIs:', trackUris.slice(0, 3));

        if (trackUris.length === 0) {
            throw new Error('No valid Spotify URIs found in the songs list');
        }

        // Add tracks to playlist in batches of 100
        for (let i = 0; i < trackUris.length; i += 100) {
            const batch = trackUris.slice(i, i + 100);
            try {
                await axios.post(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
                    uris: batch
                }, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                });
                console.log(`Added batch of ${batch.length} tracks`);
            } catch (error) {
                console.error('Error adding tracks:', error.response?.data || error.message);
                throw error;
            }
        }

        res.json({ 
            success: true, 
            playlistId,
            trackCount: trackUris.length 
        });
    } catch (error) {
        console.error('Error creating Spotify playlist:', error);
        res.status(500).json({ 
            error: 'Failed to create playlist',
            message: error.message,
            details: error.response?.data
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});