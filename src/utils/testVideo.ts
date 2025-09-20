// 测试视频管理器 - 提供本地测试视频URL
export class TestVideoManager {
  private static testVideos = [
    {
      id: 'sample1',
      name: '测试视频 1',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      description: '大兔子本尼测试视频'
    },
    {
      id: 'sample2', 
      name: '测试视频 2',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      description: '大象之梦测试视频'
    },
    {
      id: 'webcam',
      name: '摄像头测试',
      url: 'webcam',
      description: '使用摄像头进行实时测试'
    }
  ];

  static getTestVideos() {
    return [...this.testVideos];
  }

  static async loadTestVideo(videoElement: HTMLVideoElement, videoId: string): Promise<void> {
    const video = this.testVideos.find(v => v.id === videoId);
    if (!video) {
      throw new Error(`找不到测试视频: ${videoId}`);
    }

    if (video.url === 'webcam') {
      // 请求摄像头权限
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 640, height: 480 },
          audio: false 
        });
        videoElement.srcObject = stream;
        console.log('摄像头已连接');
      } catch (error) {
        console.error('摄像头访问失败:', error);
        throw new Error('无法访问摄像头，请检查权限设置');
      }
    } else {
      // 加载网络视频
      // 确保跨域媒体可读（用于 WebGL 纹理上传）
      videoElement.crossOrigin = 'anonymous' as any;
      videoElement.src = video.url;
      console.log(`已加载测试视频: ${video.name}`);
    }

    return new Promise((resolve, reject) => {
      const onLoad = () => {
        videoElement.removeEventListener('loadedmetadata', onLoad);
        videoElement.removeEventListener('error', onError);
        try { videoElement.load(); } catch {}
        resolve();
      };

      const onError = (error: Event) => {
        videoElement.removeEventListener('loadedmetadata', onLoad);
        videoElement.removeEventListener('error', onError);
        reject(new Error('视频加载失败'));
      };

      videoElement.addEventListener('loadedmetadata', onLoad);
      videoElement.addEventListener('error', onError);
    });
  }

  static stopVideo(videoElement: HTMLVideoElement): void {
    if (videoElement.srcObject instanceof MediaStream) {
      // 停止摄像头流
      const tracks = videoElement.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoElement.srcObject = null;
    } else {
      // 停止普通视频
      videoElement.pause();
      videoElement.src = '';
    }
  }
}