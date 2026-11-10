"""Boletim em motion graphics (Manim): Portaria IGAM 18/2026. Vertical 1080x1920, sem personagens."""
import json, os
import manimpango
from manim import *

AQUI = os.path.dirname(os.path.abspath(__file__))
manimpango.register_font(os.path.join(AQUI, "..", "Archivo.ttf"))
config.pixel_width, config.pixel_height = 1080, 1920
config.frame_width, config.frame_height = 9, 16
config.frame_rate = 30
config.background_color = "#0E1512"
DUR = json.load(open(os.path.join(AQUI, "dur.json")))
GAP = 0.35
OURO, VERDE, VERDE2, AGUA, CLARO, CINZA, VERM = "#E3C06A", "#2F6D52", "#5FA96F", "#6FB4D6", "#EEF0EA", "#9FB5A6", "#E07A5F"
F = "Archivo"

def T(s, size=40, cor=CLARO, peso=BOLD):
    return Text(s, font=F, font_size=size, color=cor, weight=peso)

class Boletim(Scene):
    def bloco(self, i, anims):
        """Executa as animações do bloco i e completa o tempo da locução + pausa."""
        total = DUR[i] + GAP; usado = 0
        for a, rt in anims:
            self.play(a, run_time=rt); usado += rt
        if total - usado > 0.02: self.wait(total - usado)

    def limpar(self, *mobs, rt=0.35):
        return (AnimationGroup(*[FadeOut(m, shift=UP * 0.3) for m in mobs]), rt)

    def construct(self):
        total = sum(DUR) + GAP * len(DUR)
        # moldura fixa: grade suave, cabeçalho, rodapé e barra de progresso
        grade = VGroup(*[Line([-4.5, y, 0], [4.5, y, 0], stroke_width=1, color="#173022") for y in range(-8, 9)],
                       *[Line([x, -8, 0], [x, 8, 0], stroke_width=1, color="#173022") for x in range(-4, 5)])
        topo = VGroup(T("AMBIENTAL INTELIGÊNCIA", 30, OURO), T("BOLETIM · DIÁRIO OFICIAL DE MG", 22, CINZA, NORMAL)).arrange(DOWN, buff=0.12).to_edge(UP, buff=0.5)
        rod = T("Locução gerada por IA · confira o texto oficial", 20, CINZA, NORMAL).to_edge(DOWN, buff=0.45)
        trilho = Line([-4, -7.15, 0], [4, -7.15, 0], stroke_width=6, color="#173022")
        barra = Line([-4, -7.15, 0], [-3.999, -7.15, 0], stroke_width=6, color=OURO)
        self.add(grade, trilho, barra)
        barra.add_updater(lambda m, dt: m.put_start_and_end_on([-4, -7.15, 0], [-4 + 8 * min(1, self.renderer.time / total), -7.15, 0]))

        # 0 · abertura
        ondas = VGroup(*[RoundedRectangle(width=0.22, height=h, corner_radius=0.11, fill_color=VERDE2, fill_opacity=1, stroke_width=0)
                         for h in [0.4, 0.9, 1.6, 2.2, 1.4, 0.8, 1.9, 2.4, 1.2, 0.6, 1.0]]).arrange(RIGHT, buff=0.14).shift(UP * 1.6)
        tit = VGroup(T("Ambiental", 96), T("Inteligência", 96, OURO)).arrange(DOWN, buff=0.1).shift(DOWN * 0.6)
        data = T("04/11/2026 · Portaria IGAM nº 18", 30, CINZA, NORMAL).next_to(tit, DOWN, buff=0.5)
        self.bloco(0, [(LaggedStart(*[GrowFromEdge(b, DOWN) for b in ondas], lag_ratio=0.08), 1.0),
                       (Write(tit), 1.4), (FadeIn(data, shift=UP * 0.3), 0.6), (FadeIn(topo), 0.4)])
        self.play(FadeIn(rod), FadeOut(ondas), FadeOut(tit), FadeOut(data), run_time=0.5)

        # 1 · a portaria
        card = RoundedRectangle(width=7.6, height=4.2, corner_radius=0.35, fill_color="#16231c", fill_opacity=1, stroke_color=OURO, stroke_width=4)
        selo = T("IGAM", 30, "#0E1512").move_to(card.get_top() + DOWN * 0.6)
        selo_bg = RoundedRectangle(width=1.8, height=0.7, corner_radius=0.35, fill_color=OURO, fill_opacity=1, stroke_width=0).move_to(selo)
        p1 = VGroup(T("PORTARIA Nº 18", 64), T("de 3 de novembro de 2026", 32, CINZA, NORMAL)).arrange(DOWN, buff=0.25).move_to(card).shift(DOWN * 0.2)
        pub = T("publicada no Jornal Minas Gerais em 04/11", 24, VERDE2, NORMAL).next_to(card, DOWN, buff=0.35)
        g1 = VGroup(card, selo_bg, selo, p1, pub).shift(UP * 0.8)
        self.bloco(1, [(DrawBorderThenFill(card), 0.8), (FadeIn(selo_bg, scale=0.5), 0.3), (FadeIn(selo), 0.2),
                       (Write(p1), 1.2), (FadeIn(pub, shift=UP * 0.2), 0.5)])
        self.play(g1.animate.scale(0.55).to_edge(UP, buff=2.0), run_time=0.6)

        # 2 · quem é convocado: esquema ETE → efluente → rio
        ete = VGroup(RoundedRectangle(width=2.2, height=1.6, corner_radius=0.2, fill_color="#eef4f0", fill_opacity=1, stroke_color=CLARO),
                     T("ETE", 44, "#0E1512")).shift(LEFT * 2.9 + DOWN * 0.6)
        ete[1].move_to(ete[0])
        gota = VGroup(Circle(radius=0.55, fill_color=AGUA, fill_opacity=1, stroke_width=0),
                      Triangle(fill_color=AGUA, fill_opacity=1, stroke_width=0).scale(0.45).shift(UP * 0.55)).shift(DOWN * 0.6)
        rio = VGroup(*[FunctionGraph(lambda x, k=k: 0.18 * np.sin(3 * x + k), x_range=[-1.1, 1.1], color=AGUA, stroke_width=8).shift(DOWN * (0.25 * k)) for k in range(3)]).shift(RIGHT * 2.9 + DOWN * 0.35)
        lb = VGroup(T("trata o esgoto", 22, CINZA, NORMAL).next_to(ete, DOWN, buff=0.2), T("efluente", 22, AGUA, NORMAL).next_to(gota, DOWN, buff=0.25),
                    T("rio estadual", 22, AGUA, NORMAL).next_to(rio, DOWN, buff=0.3))
        s1, s2 = Arrow(ete.get_right(), gota.get_left(), color=OURO, buff=0.15, stroke_width=8), Arrow(gota.get_right(), rio.get_left(), color=OURO, buff=0.15, stroke_width=8)
        out = VGroup(RoundedRectangle(width=7.4, height=1.1, corner_radius=0.55, fill_color=OURO, fill_opacity=1, stroke_width=0),
                     T("OUTORGA DE LANÇAMENTO", 40, "#0E1512")).shift(DOWN * 3.0)
        out[1].move_to(out[0])
        conv = T("CONVOCADAS", 34, VERDE2).shift(UP * 2.1 + DOWN * 0.6)
        self.bloco(2, [(FadeIn(conv, shift=DOWN * 0.2), 0.4), (FadeIn(ete, shift=RIGHT * 0.3), 0.6), (GrowArrow(s1), 0.4), (FadeIn(gota, scale=0.6), 0.4),
                       (GrowArrow(s2), 0.4), (Create(rio), 0.8), (FadeIn(lb), 0.5), (FadeIn(out, scale=1.2), 0.6)])
        esquema = VGroup(conv, ete, gota, rio, lb, s1, s2, out)
        self.play(FadeOut(esquema, shift=UP * 0.3), FadeOut(g1), run_time=0.4)

        # 3–6 · prazos por bacia (linha do tempo)
        h = T("PRAZO POR BACIA", 56, OURO).shift(UP * 4.6)
        sub = T("ano inteiro para formalizar o pedido", 26, CINZA, NORMAL).next_to(h, DOWN, buff=0.2)
        self.bloco(3, [(Write(h), 0.8), (FadeIn(sub), 0.4)])
        linhas = VGroup()
        dados = [("2027", ["Doce", "São Francisco", "Itapemirim", "São Mateus", "Mucuri"], VERDE2),
                 ("2028", ["Paranaíba", "Paraíba do Sul", "Itabapoana"], AGUA),
                 ("2029", ["Jequitinhonha", "Grande", "Piracicaba/Jaguari", "Pardo", "bacias do leste"], OURO)]
        y = 2.7
        for k, (ano, bac, cor) in enumerate(dados):
            ano_t = T(ano, 56, cor).move_to([-3.3, y, 0])
            barra_a = RoundedRectangle(width=0.16, height=2.2, corner_radius=0.08, fill_color=cor, fill_opacity=1, stroke_width=0).next_to(ano_t, RIGHT, buff=0.35).align_to(ano_t, UP)
            chips = VGroup(*[VGroup(RoundedRectangle(width=len(b) * 0.19 + 0.55, height=0.6, corner_radius=0.3, fill_color="#16231c", fill_opacity=1, stroke_color=cor, stroke_width=3),
                                    T(b, 24, CLARO, NORMAL)) for b in bac])
            for c in chips: c[1].move_to(c[0])
            chips.arrange_in_grid(cols=2, buff=(0.18, 0.18), cell_alignment=LEFT)
            chips.scale(0.84)
            chips.next_to(barra_a, RIGHT, buff=0.3).align_to(barra_a, UP)
            grupo = VGroup(ano_t, barra_a, chips); linhas.add(grupo)
            self.bloco(4 + k, [(FadeIn(ano_t, shift=RIGHT * 0.4), 0.5), (GrowFromEdge(barra_a, UP), 0.4),
                               (LaggedStart(*[FadeIn(c, shift=RIGHT * 0.2) for c in chips], lag_ratio=0.25), 1.6)])
            y -= 3.0
        self.play(FadeOut(VGroup(h, sub, linhas), shift=UP * 0.3), run_time=0.4)

        # 7 · SOUT
        tela = RoundedRectangle(width=6.6, height=4.0, corner_radius=0.25, fill_color="#f4f8f6", fill_opacity=1, stroke_color=CLARO, stroke_width=6).shift(UP * 0.8)
        base = Polygon([-3.9, -1.3, 0], [3.9, -1.3, 0], [3.4, -1.0, 0], [-3.4, -1.0, 0], fill_color="#9aa0a6", fill_opacity=1, stroke_width=0)
        cab = Rectangle(width=6.6, height=0.8, fill_color="#1f5f8b", fill_opacity=1, stroke_width=0).align_to(tela, UP).shift(UP * 0)
        cab_t = T("SOUT · Sistema de Outorga do Igam", 26, CLARO).move_to(cab)
        itens = VGroup(*[T("✓ " + s, 28, "#0E1512", NORMAL) for s in ["Vazão do efluente", "Qualidade (amostras)", "Ponto de lançamento"]]).arrange(DOWN, aligned_edge=LEFT, buff=0.3).move_to(tela).shift(DOWN * 0.3)
        self.bloco(7, [(FadeIn(tela, scale=0.9), 0.5), (FadeIn(base), 0.2), (FadeIn(cab), 0.2), (Write(cab_t), 0.6),
                       (LaggedStart(*[FadeIn(i, shift=RIGHT * 0.3) for i in itens], lag_ratio=0.4), 1.4)])
        self.play(FadeOut(VGroup(tela, base, cab, cab_t, itens)), run_time=0.35)

        # 8 · alerta
        tri = Triangle(fill_color="#FFD34D", fill_opacity=1, stroke_color="#0E1512", stroke_width=6).scale(1.5).shift(UP * 2.2)
        exc = T("!", 120, "#0E1512").move_to(tri).shift(DOWN * 0.3)
        cal = VGroup(RoundedRectangle(width=3.6, height=3.0, corner_radius=0.25, fill_color=CLARO, fill_opacity=1, stroke_width=0),
                     Rectangle(width=3.6, height=0.7, fill_color=VERM, fill_opacity=1, stroke_width=0)).shift(DOWN * 1.4)
        cal[1].align_to(cal[0], UP)
        xx = VGroup(Line(UL, DR), Line(UR, DL)).set_stroke(VERM, 18).scale(0.7).move_to(cal[0]).shift(DOWN * 0.3)
        dec = VGroup(T("SANÇÕES", 44, VERM), T("Decreto 47.383/2018", 40, CLARO)).arrange(DOWN, buff=0.15).shift(DOWN * 4.3)
        self.bloco(8, [(DrawBorderThenFill(tri), 0.6), (FadeIn(exc, scale=1.6), 0.3), (FadeIn(cal, shift=UP * 0.3), 0.5),
                       (Create(xx), 0.6), (Write(dec), 1.0), (Wiggle(tri), 0.8)])
        self.play(FadeOut(VGroup(tri, exc, cal, xx, dec)), run_time=0.35)

        # 9 · demais atividades
        prox = VGroup(T("E DEPOIS?", 56, OURO), T("As demais atividades que", 34, CLARO, NORMAL),
                      T("lançam efluente serão convocadas", 34, CLARO, NORMAL), T("em atos posteriores do Igam", 34, CLARO, NORMAL)).arrange(DOWN, buff=0.25)
        pts = VGroup(*[Dot(radius=0.12, color=OURO) for _ in range(3)]).arrange(RIGHT, buff=0.35).next_to(prox, DOWN, buff=0.6)
        self.bloco(9, [(FadeIn(prox[0], scale=1.3), 0.4), (LaggedStart(*[FadeIn(x, shift=UP * 0.2) for x in prox[1:]], lag_ratio=0.3), 1.2),
                       (LaggedStart(*[FadeIn(p, scale=2) for p in pts], lag_ratio=0.3), 0.9)])
        self.play(FadeOut(VGroup(prox, pts)), run_time=0.35)

        # 10 · fechamento
        res = VGroup(T("EM RESUMO", 48, OURO),
                     T("1. ETE que lança em rio estadual", 30, CLARO, NORMAL), T("    pede a outorga de lançamento", 30, CINZA, NORMAL),
                     T("2. Prazo por bacia: 2027 · 2028 · 2029", 30, CLARO, NORMAL),
                     T("3. Pedido no SOUT; perdeu o prazo = sanções", 30, CLARO, NORMAL)).arrange(DOWN, aligned_edge=LEFT, buff=0.3).shift(UP * 1.2)
        link = VGroup(T("Texto oficial: link na descrição", 30, VERDE2), T("oanalistaambiental.com/radar-audio", 26, CINZA, NORMAL)).arrange(DOWN, buff=0.15).shift(DOWN * 3.2)
        self.bloco(10, [(LaggedStart(*[FadeIn(x, shift=RIGHT * 0.2) for x in res], lag_ratio=0.25), 2.2), (FadeIn(link, shift=UP * 0.2), 0.6)])
        self.wait(1.2)
