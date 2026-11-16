# Tomas: registro de medicación

App para el móvil que registra qué medicación toca, a qué hora, y si se ha tomado (con la hora real de la toma).
Se instala como una app más, funciona sin conexión y puede compartirse entre dos móviles.

## 1. Subirla a GitHub (10 minutos)

1. En github.com pulsa **New repository**. Ponle un nombre (por ejemplo `tomas`) y márcalo como **Public**
   (GitHub Pages gratis lo necesita). No contiene datos personales: los datos viven en cada móvil y en tu Firebase.
2. En el repositorio nuevo pulsa **uploading an existing file** y arrastra **todos los archivos** de esta carpeta
   (index.html, app.js, styles.css, sw.js, manifest.json, config.js y las tres imágenes .png). Pulsa **Commit changes**.
3. Ve a **Settings → Pages**. En *Branch* elige `main` y carpeta `/ (root)`. Guarda.
4. Espera un par de minutos. Arriba aparecerá la dirección: `https://TU-USUARIO.github.io/tomas/`

## 2. Ponerla en el móvil

- **iPhone**: abre la dirección en **Safari** → botón Compartir → **Añadir a pantalla de inicio**.
- **Android**: abre la dirección en **Chrome** → menú (tres puntos) → **Instalar aplicación** / Añadir a pantalla de inicio.

Haced esto en los dos móviles. Abridla siempre desde el icono nuevo.

## 3. Compartir los datos entre los dos móviles (Firebase, gratis)

Sin este paso la app funciona igual, pero cada móvil guarda lo suyo.

1. Entra en https://console.firebase.google.com con una cuenta de Google y pulsa **Crear proyecto**
   (puedes desactivar Google Analytics).
2. Dentro del proyecto: **Compilación → Firestore Database → Crear base de datos**. Elige una región de Europa
   y el modo *producción*.
3. En la pestaña **Reglas** pega esto y pulsa **Publicar**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /shared/{code} {
      allow get, create, update: if true;
    }
  }
}
```

4. En la rueda de **Configuración del proyecto → General → Tus apps** pulsa el icono web `</>`, ponle un nombre y
   copia el bloque `firebaseConfig`.
5. En GitHub abre el archivo `config.js`, pulsa el lápiz y sustituye `null` por ese bloque, con este formato:

```
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

6. Espera un minuto y cierra y abre la app. En **Ajustes → Compartir con tu pareja** pulsa **Crear código nuevo**
   en un móvil y escribe ese código en el otro con **Unirme con este código**.

Sobre la privacidad: el código de 12 caracteres funciona como contraseña. Quien no lo tenga no puede leer los datos
(las reglas no permiten listar la base de datos). Aun así, es información de salud: no compartáis el código con nadie.

## 4. Avisos a la hora de la toma

Una web instalada no puede lanzar avisos fiables con la app cerrada. Por eso hay dos opciones:

- **Avisos del calendario (recomendado, suenan siempre)**: en **Ajustes → Crear avisos en el calendario del móvil**.
  Se abre un archivo que el móvil añade a su calendario, con un evento diario y una alarma para cada toma.
  Si cambiáis horas o medicación, repetid este paso (borrad antes los eventos antiguos del calendario).
- **Avisos dentro de la app**: se activan en Ajustes y solo saltan si la app está abierta o en segundo plano.
  En iPhone requieren iOS 16.4 o superior y la app instalada en la pantalla de inicio.

## 5. Actualizar la app

Editad el archivo en GitHub y haced *Commit*. Al abrir la app con conexión se actualiza sola.

## Copia de seguridad

En Ajustes hay un botón para descargar todos los datos en un archivo y otro para restaurarlos.
