- **Canlı ve Parçalı Yayınları İndirme Desteği:** m3u8 gibi özel yayın akışlarını **yt-dlp** ve hızlandırıcı olarak **aria2** kullanarak indirme kodunu otomatik oluşturur.


# Video Link Finder Extension

Bu eklenti, XDM (Xtreme Download Manager) benzeri bir mantıkla çalışarak ziyaret ettiğiniz web sayfalarındaki video bağlantılarını otomatik olarak tespit eder. Ağ isteklerini (Network tabanlı m3u8, mp4 vb.) ve sayfa içindeki (DOM tabanlı HTML5 `<video>`) etiketleri tarar.

## Nasıl Kurulur?

1. Google Chrome tarayıcısını açın.
2. Adres çubuğuna `chrome://extensions/` yazın ve Enter'a basın.
3. Sağ üst köşedeki **"Geliştirici modu" (Developer mode)** seçeneğini aktif hale getirin.
4. Sol üstte beliren **"Paketlenmemiş öğe yükle" (Load unpacked)** butonuna tıklayın.
5. Yeni oluşturduğumuz klasörü seçin: `c:\Users\User\projects\xdm`
6. Eklenti tarayıcınıza yüklenecektir. Uzantılar menüsünden (yapboz simgesi) eklentiyi panele sabitleyebilirsiniz.

## Nasıl Kullanılır?

1. Herhangi bir video izleme sitesine (veya içinde video barındıran bir siteye) girin.
2. Eklenti arka planda sayfadaki videoları ve medya ağı isteklerini algılamaya başlar.
3. Video bulundukça eklenti simgesinin üzerinde kırmızı bir bildirim rozeti belirir.
4. Eklenti simgesine tıklayarak tespit edilen videoların listesini görebilir, linkleri kopyalayabilir veya doğrudan indirebilirsiniz (İndirme işlemi her video formatı için doğrudan çalışmayabilir, m3u8 gibi formatlar özel indiriciler gerektirir).

## Özellikler listesi
- HLS (m3u8), DASH ve doğrudan (mp4, webm) video isteklerini yakalama.
- Sayfa içindeki `<video>` etiketlerini anlık takip etme.
- Videoların URL'lerini kopyalama ve indirme seçenekleri.
