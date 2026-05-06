class BgScene {
    constructor() {
        this.canvas   = document.getElementById('bgCanvas');
        if (!this.canvas) return;

        this.scene    = new THREE.Scene();
        this.camera   = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .1, 1000);
        this.renderer = new THREE.WebGLRenderer({
            canvas    : this.canvas,
            alpha     : true,
            antialias : true
        });

        this.renderer.setSize(innerWidth, innerHeight);
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        this.camera.position.z = 5;
        this.clock    = new THREE.Clock();
        this.paused   = false;
        this.targetColor = new THREE.Color(0x00e400);

        this.build();

        // Resize
        addEventListener('resize', () => {
            this.camera.aspect = innerWidth / innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(innerWidth, innerHeight);
            if (this.composer) this.composer.setSize(innerWidth, innerHeight);
        });

        // Pause when hidden
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.paused = true;
            } else {
                this.paused = false;
                this.run();
            }
        });

        // Cleanup
        window.addEventListener('beforeunload', () => this.dispose());

        this.run();
    }

    build() {
        var isMobile      = window.innerWidth < 768;
        var particleCount = isMobile ? 800 : 2000;

        // Globe
        var g    = new THREE.SphereGeometry(1.5, 32, 32);
        this.globe = new THREE.Mesh(g, new THREE.MeshPhongMaterial({
            color       : 0x00b4ff,
            wireframe   : true,
            transparent : true,
            opacity     : .08
        }));
        this.scene.add(this.globe);

        // Particles
        var pg = new THREE.BufferGeometry();
        var pp = new Float32Array(particleCount * 3);
        for (var i = 0; i < pp.length; i++) pp[i] = (Math.random() - .5) * 12;
        pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
        this.pts = new THREE.Points(pg, new THREE.PointsMaterial({
            color       : 0x00b4ff,
            size        : .015,
            transparent : true,
            opacity     : .35
        }));
        this.scene.add(this.pts);

        // Lights
        this.scene.add(new THREE.AmbientLight(0x404060, .5));
        var l = new THREE.PointLight(0x00b4ff, 1, 20);
        l.position.set(4, 3, 4);
        this.scene.add(l);
    }

    updateAQI(a) {
        var c = new THREE.Color();
        if      (a > 300) c.setHex(0x7e0023);
        else if (a > 200) c.setHex(0x8f3f97);
        else if (a > 150) c.setHex(0xff0000);
        else if (a > 100) c.setHex(0xff7e00);
        else if (a > 50)  c.setHex(0xffff00);
        else              c.setHex(0x00e400);

        this.targetColor = c;

        // CSS glow
        if (a > 150) {
            this.canvas.style.filter = 'brightness(1.3) drop-shadow(0 0 8px rgba(255,0,0,0.4))';
        } else if (a > 100) {
            this.canvas.style.filter = 'brightness(1.2) drop-shadow(0 0 6px rgba(255,126,0,0.3))';
        } else {
            this.canvas.style.filter = 'brightness(1.1) drop-shadow(0 0 4px rgba(0,228,0,0.2))';
        }
    }

    addHotspots(hotspots) {
        this.clearHotspots();
        hotspots.forEach(spot => {
            var pos   = this.latLonToVec3(spot.lat, spot.lon, 1.52);
            var color = spot.aqi > 150 ? 0xff0000 :
                        spot.aqi > 100 ? 0xff7e00 :
                        spot.aqi > 50  ? 0xffff00 : 0x00e400;
            var dot   = new THREE.Mesh(
                new THREE.SphereGeometry(0.02, 8, 8),
                new THREE.MeshBasicMaterial({ color })
            );
            dot.position.copy(pos);
            this.scene.add(dot);
            this.hotspotMeshes = this.hotspotMeshes || [];
            this.hotspotMeshes.push(dot);
        });
    }

    clearHotspots() {
        if (!this.hotspotMeshes) return;
        this.hotspotMeshes.forEach(dot => {
            this.scene.remove(dot);
            dot.geometry.dispose();
            dot.material.dispose();
        });
        this.hotspotMeshes = [];
    }

    latLonToVec3(lat, lon, r) {
        var phi   = (90 - lat)  * (Math.PI / 180);
        var theta = (lon + 180) * (Math.PI / 180);
        return new THREE.Vector3(
            -(r * Math.sin(phi) * Math.cos(theta)),
              (r * Math.cos(phi)),
              (r * Math.sin(phi) * Math.sin(theta))
        );
    }

    dispose() {
        this.renderer.dispose();
        this.globe.geometry.dispose();
        this.globe.material.dispose();
        this.pts.geometry.dispose();
        this.pts.material.dispose();
        this.clearHotspots();
    }

    run() {
        if (this.paused) return;
        requestAnimationFrame(() => this.run());

        var t = this.clock.getElapsedTime();

        // Smooth color lerp
        if (this.globe && this.targetColor) {
            this.globe.material.color.lerp(this.targetColor, 0.02);
        }

        // Rotate
        if (this.globe) this.globe.rotation.y += .001;
        if (this.pts) {
            this.pts.rotation.y  += .0005;
            this.pts.rotation.x   = Math.sin(t * .2) * .03;
        }

        // Pulse hotspots
        if (this.hotspotMeshes) {
            var pulse = Math.sin(t * 3) * 0.5 + 1.0;
            this.hotspotMeshes.forEach(dot => dot.scale.setScalar(pulse));
        }

        // Camera float
        this.camera.position.x = Math.sin(t * .05) * .3;
        this.camera.position.y = Math.cos(t * .08) * .2;
        this.camera.lookAt(this.scene.position);

        this.renderer.render(this.scene, this.camera);
    }
}

var bgScene = new BgScene();