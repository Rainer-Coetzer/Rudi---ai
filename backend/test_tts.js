import { UniversalEdgeTTS } from 'edge-tts-universal';

async function test() {
  try {
    const tts = new UniversalEdgeTTS('Hello Sir', 'en-GB-RyanNeural');
    console.log('Synthesizing...');
    const result = await tts.synthesize();
    console.log('Success! Result keys:', Object.keys(result));
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }
}

test();
