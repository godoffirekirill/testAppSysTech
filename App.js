import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, Button, Alert, TextInput, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import axios from 'axios';
import NetInfo from '@react-native-community/netinfo';

export default function App() {
  const [fileName, setFileName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [uploadEndpoint, setUploadEndpoint] = useState('');
  const [loading, setLoading] = useState(false);
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [timerId, setTimerId] = useState(null);
  const [isConnected, setIsConnected] = useState(true);
  const [isRecording, setIsRecording] = useState(false); // New state to track recording status

  // Use ref to store the recording instance
  const recordingRef = useRef(null);

  useEffect(() => {
    const checkPermissions = async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Microphone access is required to record audio.');
      }
    };

    checkPermissions();

    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
      if (!state.isConnected) {
        Alert.alert('Network Error', 'No internet connection. Please check your network settings.');
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  function handleSaveServerUrl() {
    if (!serverUrl.trim()) {
      Alert.alert('Invalid Input', 'Please enter a valid server URL.');
      return;
    }

    setUploadEndpoint(`${serverUrl}/upload`);
    Alert.alert('Success', `Server URL set to ${serverUrl}`);
  }

  async function startRecording() {
    // Check if a recording is already in progress
    if (recordingRef.current) {
      Alert.alert('Recording in Progress', 'A recording is already in progress. Please stop it before starting a new one.');
      return;
    }
  
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Microphone access is required to record audio.');
      return;
    }
  
    if (!isConnected) {
      Alert.alert('Network Error', 'No internet connection. Please check your network before recording.');
      return;
    }
  
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });
  
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording; // Set the ref
      setIsRecording(true); // Update state to reflect recording status
      console.log('Recording started:', recording);
  
      if (hours || minutes) {
        startTimer(); // Start timer if hours or minutes are provided
      }
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
      recordingRef.current = null; // Reset in case of error
      setIsRecording(false);
    }
  }

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) {
      Alert.alert('No Recording', 'There is no recording to stop.');
      return;
    }
  
    clearTimer(); // Clear any existing timer
  
    try {
      console.log('Stopping the recording...');
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      console.log('Recording stopped. URI:', uri);
  
      // Reset the recording state
      recordingRef.current = null; // Clear the ref to allow new recordings
      setIsRecording(false); // Update state to reflect recording status
  
      // Apply audio mode settings
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  
      // Check if the recording is valid and then attempt upload
      if (uri) {
        const name = fileName.trim() || `recording_${new Date().toISOString()}.m4a`;
        console.log('Attempting to upload file:', name);
        await attemptUploadFile(uri, name); // Await upload attempt to ensure proper flow
      } else {
        console.log('No valid URI to upload');
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
      Alert.alert('Error', 'Failed to stop recording. Please try again.');
    }
  }, [fileName]);

  const startTimer = () => {
    const parsedHours = parseInt(hours) || 0;
    const parsedMinutes = parseInt(minutes) || 0;
    const duration = (parsedHours * 3600) + (parsedMinutes * 60);

    // Only start the timer if duration is greater than 0
    if (duration > 0) {
      clearTimer(); // Clear any existing timer before starting a new one

      console.log(`Starting timer for ${duration} seconds`);

      const id = setTimeout(() => {
        console.log(`Timer expired after ${duration} seconds`);
        stopRecording(); // Ensure stopRecording is called here
      }, duration * 1000);

      setTimerId(id);
    }
  };

  function clearTimer() {
    if (timerId) {
      clearTimeout(timerId);
      setTimerId(null);
      console.log('Timer cleared');
    }
  }

  async function attemptUploadFile(uri, name) {
    let attempts = 0;
    let delay = 30000;

    const uploadFileWithRetries = async () => {
      if (!isConnected) {
        Alert.alert('Network Error', 'No internet connection. Retrying upload when connection is restored.');
        return;
      }

      setLoading(true);
      try {
        await uploadFile(uri, name);
        setLoading(false);
        Alert.alert('Upload Success', 'Your recording has been uploaded successfully.');
      } catch (error) {
        attempts++;
        console.error(`Upload attempt ${attempts} failed:`, error);

        if (attempts < 5) {
          console.log(`Retrying in ${delay / 1000} seconds...`);
          setTimeout(uploadFileWithRetries, delay);
          delay *= 2;
        } else {
          setLoading(false);
          Alert.alert('Upload Error', 'Failed to upload recording after 5 attempts. Please try again later.');
        }
      }
    };

    uploadFileWithRetries();
  }

  async function uploadFile(uri, name) {
    const formData = new FormData();
    formData.append('file', {
      uri,
      type: 'audio/m4a',
      name,
    });
  
    try {
      const response = await axios.post(uploadEndpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (response.status !== 200) {
        throw new Error('Upload failed with status ' + response.status);
      }
    } catch (error) {
      console.error('Error in uploadFile:', error.message);
      throw error;
    }
  }

  async function checkApi() {
    try {
      const response = await fetch(`${serverUrl}/status`, {
        method: 'GET',
        mode: 'no-cors',
      });
      Alert.alert('API Check', `Server at ${serverUrl} is reachable`);
    } catch (error) {
      Alert.alert('API Check Failed', `Unable to reach the server at ${serverUrl}`);
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Enter server URL"
        value={serverUrl}
        onChangeText={setServerUrl}
      />
      <Button
        title="Save Server URL"
        onPress={handleSaveServerUrl}
      />
      <TextInput
        style={styles.input}
        placeholder="Enter file name (optional)"
        value={fileName}
        onChangeText={setFileName}
      />
      <View style={styles.timeInputs}>
        <TextInput
          style={styles.timeInput}
          placeholder="Hours"
          keyboardType="numeric"
          value={hours}
          onChangeText={setHours}
        />
        <TextInput
          style={styles.timeInput}
          placeholder="Minutes"
          keyboardType="numeric"
          value={minutes}
          onChangeText={setMinutes}
        />
      </View>
      <Button
        title={isRecording ? 'Stop Recording' : 'Start Recording'}
        onPress={isRecording ? stopRecording : startRecording}
      />
      <Button
        title="Check Server"
        onPress={checkApi}
      />
      {loading && <ActivityIndicator size="large" color="#0000ff" />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#ecf0f1',
    padding: 10,
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  timeInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  timeInput: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    width: '48%',
    paddingHorizontal: 10,
  },
});
